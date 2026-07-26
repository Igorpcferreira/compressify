# Plano técnico — Compressify Web

> Documento da Etapa 2. Descreve a arquitetura decidida, o inventário de dependências
> com versões verificadas em 25/07/2026, a estrutura de pastas e o trabalho quebrado
> em incrementos entregáveis.
>
> **Revisado em 25/07/2026 após o Incremento 0.** As medições do
> [`SPIKE.md`](SPIKE.md) derrubaram quatro suposições deste documento; os valores
> abaixo já são os corrigidos. Onde um número mudou, o texto diz qual era o anterior e
> por quê — a rastreabilidade importa mais que a limpeza.

---

## 0. Decisões tomadas nesta etapa

Quatro pontos ficaram abertos na Etapa 1. Três foram respondidos e um foi delegado a mim.

| #   | Questão                               | Decisão                                                                               |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | PNG com perda                         | **Aprovado.** Entra `image-q` para quantização. Detalhe em §3.4                       |
| 2   | Contrastes do design system           | **Design system é ajustável.** Três emendas em §5                                     |
| 3   | Piso de 900px                         | **Minha escolha:** corrigir para piso real de 900px. Justificativa em §3.3            |
| 4   | Decodificação                         | **Minha escolha:** híbrida — nativa primeiro, WASM de fallback. Justificativa em §3.2 |
| 5   | Quantização PNG (reaberta pelo spike) | **Quantizador próprio**, não `image-q`. Justificativa em §3.4                         |

---

## 1. Arquitetura

### 1.1 Visão geral

```
                        thread principal
  ┌──────────────────────────────────────────────────────────┐
  │  Dropzone ──► queueStore (Zustand) ◄── FileCard × N       │
  │                     │         ▲                           │
  │                     ▼         │ onProgress / onResult      │
  │              QueueOrchestrator                            │
  │                     │                                     │
  │                WorkerPool  (dimensionado por núcleos       │
  │                     │       E por megapixels em voo)       │
  └─────────────────────┼─────────────────────────────────────┘
                        │  postMessage / Transferable
        ┌───────────────┼───────────────┬───────────────┐
        ▼               ▼               ▼               ▼
    Worker 1        Worker 2        Worker 3   ...   Worker N
        │
        │  1. decode      createImageBitmap → OffscreenCanvas
        │                 (fallback: @jsquash/*/decode)
        │  2. estratégia  renderAutomatic | renderTargeted   ◄── código puro,
        │                 (porte de src/main/index.ts)            testado sem WASM
        │  3. resize      @jsquash/resize (cache por escala)
        │  4. encode      @jsquash/{jpeg,webp,avif,png}
        │  5. progresso   postMessage a cada tentativa
        ▼
     JobResult { blob, bytes, savedPercent, status, outputName }
```

**Regra estrutural:** a thread principal nunca toca em pixels. Ela só orquestra,
recebe `postMessage` e renderiza. Nenhum `ArrayBuffer` de imagem é copiado — tudo
passa como `Transferable`.

### 1.2 A interface do motor

Conforme o brief §3.2. Mantida genérica para PDF/vídeo/áudio entrarem sem reescrita:

```ts
export interface CompressionEngine {
  readonly id: string
  supports(file: File): boolean
  probe(file: File): Promise<FileMetadata>
  process(file: File, options: JobOptions, ctx: JobContext): Promise<JobResult>
}

export interface JobContext {
  onProgress(percent: number): void
  readonly signal: AbortSignal
}
```

Na Fase 1 existe um único implementador, `ImageEngine`. O registro
(`src/engine/core/registry.ts`) resolve o motor por `supports(file)`, então a Fase 2
adiciona `PdfEngine` sem tocar no orquestrador nem na fila.

### 1.3 O ponto mais importante do plano: o algoritmo é código puro

O ativo intelectual do projeto — a escada de qualidade e a busca binária com downscale
— vira um módulo **sem nenhuma dependência de WASM, canvas ou DOM**:

```ts
// src/engine/image/strategy.ts
export type RenderAttempt = { quality: number; scale: number }
export type Renderer = (attempt: RenderAttempt) => Promise<Uint8Array>

export function renderAutomatic(render: Renderer, opts: AutomaticOptions): Promise<RenderOutcome>
export function renderTargeted(render: Renderer, opts: TargetedOptions): Promise<RenderOutcome>
```

A estratégia recebe uma função `render` e não sabe o que há do outro lado. Nos testes,
injetamos um renderizador sintético com modelo de tamanho conhecido; em produção,
injetamos os codecs.

Isso é o que torna o critério do brief §7 — _"o algoritmo de busca binária e a lógica de
meta de tamanho precisam de testes unitários com casos de borda"_ — realizável de fato,
sem carregar 3,4 MB de WASM dentro do jsdom.

### 1.4 Estado — Zustand

Escolhido pelo argumento de re-render, não por preferência. Com um pool de 8 workers
reportando progresso, teremos dezenas de eventos por segundo. Em Context + reducer,
cada evento re-renderiza todos os consumidores: 50 cards repintam porque um foi de 61%
para 62%. O Zustand assina por seletor — cada `FileCard` observa só o próprio item.

Com 50 arquivos na fila essa diferença é exatamente o critério de aceite #4 ("a aba não
trava nem fica sem resposta").

Store única em `src/store/queue.ts`, com o array de itens normalizado por `id` e
seletores estáveis (`selectItemById`, `selectSummary`, `selectIsRunning`).

### 1.5 Renderização e deploy

`output: 'export'` no `next.config.ts`. Gera HTML estático puro; não existe function
no deploy da Vercel para ser invocada. Isso torna a promessa "nada é enviado"
verificável estruturalmente, não só por inspeção da aba Network.

Custo aceito: sem `next/image` otimizado (usaremos `unoptimized`), sem route handlers,
sem ISR. Nada disso é usado no produto.

---

## 2. Concorrência e memória

### 2.1 Dimensionamento do pool

O brief propõe `hardwareConcurrency - 1`, mínimo 1, máximo 8. Mantenho isso como o
limite de **workers**, mas adiciono um segundo limite, de **megapixels em voo**:

```
workers        = clamp(hardwareConcurrency - 1, 1, 8)
orçamentoMP    = deviceMemory ? clamp(deviceMemory * 16, 48, 160) : 96
```

> **Revisto após o spike.** O padrão era 48 MP. Com 48, um lote de 12MP só roda 4 em
> paralelo e o tempo dobra (§6 do `SPIKE.md`): 19 s em vez de 9 s para 50 fotos no
> Chromium. 8 imagens de 12MP simultâneas são ~384 MB de `ImageData` — folgado num
> desktop. O valor volta a ser afinado com medição real de memória no Incremento 4.

Cada job reserva `width × height / 1e6` MP antes de entrar num worker e libera ao sair.
O despacho só ocorre se houver worker livre **e** orçamento disponível.

Motivo: uma imagem de 24 MP decodificada ocupa 96 MB de RGBA; com a cópia
redimensionada e os buffers internos do encoder, ~300 MB por worker. Oito workers com
fotos grandes = 2,4 GB e a aba morre. Com o orçamento, oito fotos de 2 MP rodam em
paralelo (16 MP), mas duas de 24 MP já saturam — que é o comportamento correto.

Um job cujo tamanho isolado excede o orçamento roda mesmo assim, sozinho, com aviso na
UI. Melhor tentar do que recusar.

### 2.2 Cancelamento

`AbortSignal` na thread principal → o orquestrador remove jobs não iniciados da fila e
envia `{ type: 'abort', jobId }` aos workers ocupados. O worker checa `signal.aborted`
entre tentativas de encode (o ponto natural de interrupção, já que um encode individual
não é interrompível).

Se um worker não responder em 2 s após o abort, ele é **terminado e recriado** — é o
único jeito de garantir o cancelamento durante um encode AVIF longo. O pool mantém
workers como recurso substituível, não como singleton.

O spike deu motivo concreto extra: o `@jsquash/avif` **quebrou uma vez no Firefox** ao
instanciar o módulo pela segunda vez sob pressão de memória, e não reproduziu na
tentativa seguinte. O pool trata falha de worker com uma retentativa antes de marcar o
job como `error`.

### 2.2.1 Guarda de orçamento de tempo (novo, vindo do spike)

O Firefox roda os codecs 3–10× mais devagar que o Chromium (`SPIKE.md` §4). No pior caso
do modo meta, uma imagem de 12MP levaria ~305 s lá. Isso trava a fila e o usuário fecha
a aba.

Cada job recebe um **teto de 20 s**. Ao estourar, a busca para e devolve o melhor
resultado obtido até ali com status `warning` e mensagem explícita ("interrompido pelo
limite de tempo; este é o menor tamanho alcançado"). O teto é do job inteiro, não de
cada encode, e é verificado no mesmo ponto do `signal.aborted` — entre tentativas.

### 2.3 Progresso real por arquivo

O worker reporta a cada tentativa concluída:

- **Modo automático:** `10% (decode) + 85% × (passo / tamanhoDaEscada)`.
- **Modo meta:** `10% + 85% × (tentativasFeitas / tentativasEstimadas)`, onde a
  estimativa começa em 7 e é reestimada a cada novo nível de escala.

O percentual é **clampado como monotônico** — nunca anda para trás, mesmo quando a
estimativa piora — e trava em 95% até o resultado sair. Progresso que retrocede lê como
bug mesmo quando é honesto.

---

## 3. O porte do motor, decisão por decisão

### 3.1 Fidelidade: o que é preservado e o que muda

**Preservado exatamente:**

- Escada de qualidade do modo automático, incluindo a injeção da qualidade escolhida
  pelo usuário no conjunto `[requestedQuality, 82, 74, 66, 58, 48, 38]`, deduplicado,
  clampado em 24–95 e ordenado decrescente.
- Busca binária: `low = 24`, `high = min(qualidadeMax, 95)`, meta efetiva
  `min(metaPedida, max(1024, floor(originalBytes × 0.98)))`.
- Downscale progressivo por fator 0,84, até 8 níveis.
- Semântica de `smart` (WebP, exceto AVIF que permanece AVIF) e `original`.
- Nomenclatura `-compressify` com desambiguação por índice em caso de colisão.
- Estrutura relativa de subpastas na saída.
- Status `success | warning | error` e as mesmas mensagens de aviso.

**Duas mudanças deliberadas de comportamento, ambas testadas:**

1. **Saída antecipada da busca binária quando `low > high`.** O original roda 7
   iterações fixas. Como a sequência de qualidades aceitas é monotonicamente crescente,
   o último buffer aceito é sempre o de maior qualidade sob a meta; as iterações após a
   convergência apenas reencodam qualidades já testadas. A saída antecipada produz
   **bytes idênticos**. Haverá um teste que prova a equivalência comparando o resultado
   das duas implementações sobre um modelo de tamanho sintético.

   > **Revisto após o spike.** Eu havia estimado ~30% menos encodes; a medição real
   > (`SPIKE.md` §5.4.1) deu **1 encode em 7, ~14%**. A equivalência de bytes foi
   > confirmada empiricamente nos quatro casos testados.

2. **Piso de 900px real** (ver §3.3).

**O que não será idêntico, e precisa estar no critério de aceite:**

Os encoders são outros. Sharp/AVIF usa `effort: 0–9` (maior = mais lento); jSquash/AVIF
usa `speed: 0–10` (maior = mais **rápido**) — escalas invertidas e não equivalentes.
Sharp/WebP usa `effort`, jSquash usa `method`. Proponho que o critério de aceite #2
("resultados equivalentes ao app Electron") seja lido como:

> Sobre o mesmo conjunto de teste: a meta de tamanho é atingida ou não atingida
> igualmente, e o tamanho final fica dentro de **±10%** do produzido pelo app Electron.
> **O AVIF fica fora desta banda** e é tratado como melhor esforço — ver §3.6.

Bytes idênticos não é uma meta alcançável e perseguir isso seria desperdício.

### 3.2 Decodificação — híbrida (decisão 4)

**Caminho principal:** `createImageBitmap(blob, { imageOrientation: 'from-image' })` →
`OffscreenCanvas` → `getImageData()`, tudo dentro do worker.

**Fallback:** `@jsquash/{jpeg,png,webp,avif}/decode`, acionado quando
`createImageBitmap` lança ou o formato não é suportado pelo navegador.

Por quê:

- **No Firefox o ganho é grande: 2,9–6,9×** — e o Firefox é onde sobra menos margem
  (`SPIKE.md` §4). O decode roda em 100% dos arquivos.
- Resolve orientação EXIF para **todos** os formatos, não só JPEG. O `.rotate()` do
  Sharp é requisito de fidelidade: sem ele, toda foto de celular sai deitada.
- Tira ~1,5 MB de WASM do caminho crítico (mozjpeg_dec 163 KB + webp_dec 135 KB +
  avif_dec 1,14 MB + png 177 KB) — é o que sustenta a meta de Lighthouse.

> **Revisto após o spike.** Este parágrafo dizia que o decode nativo seria "ordens de
> grandeza mais rápido". **Era exagero.** No Chromium o ganho vai de 1,0× a 2,8× e, em
> JPEG de 12MP, o decoder WASM foi na verdade **mais rápido** que o nativo. A decisão se
> mantém, mas apoiada no Firefox, no bundle e no EXIF — não na velocidade em Chromium.

Riscos aceitos e mitigados:

- O readback do canvas passa pelo gerenciamento de cor. Uso
  `getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })` para fixar o
  espaço. O Sharp já descarta o perfil ICC por padrão hoje, então o app desktop tem o
  mesmo desvio em imagens wide-gamut — não é regressão.
- Firefox com `privacy.resistFingerprinting` injeta ruído no `getImageData`. Afeta
  pixels de forma imperceptível e não corrompe. Documentado no README como degradação
  conhecida.
- PNG de 16 bits é rebaixado para 8 bits no canvas. O fallback WASM preserva; adiciono
  detecção de profundidade no `probe()` para rotear PNGs de 16 bits ao caminho WASM.

### 3.3 Piso de 900px — corrigir (decisão 3)

Comportamento atual em [`src/main/index.ts:567`](../src/main/index.ts#L567): testa as
dimensões **da escala atual** e só então multiplica por 0,84. Uma imagem de 1000px passa
no teste, vira 840px, e só aí o loop para. O piso efetivo é ~756px, não 900.

**Escolho corrigir:** o teste passa a avaliar as dimensões **resultantes** do próximo
passo. Um passo só é aceito se ambas as dimensões permanecerem ≥ 900px.

Três motivos: o contrato documentado é o que o produto promete; o comportamento vira
previsível ("nunca abaixo de 900px" é verdade, ponto); e "imagem menor que 900px" é
literalmente um dos casos de borda que o brief §7 exige testar — o teste precisa de um
contrato limpo para verificar.

**Uma limitação do original que preservo de propósito:** a condição é um `AND` sobre as
duas dimensões, então uma imagem cujo lado menor já é ≤ 900px nunca é redimensionada
(um banner 8000×600, por exemplo, só pode usar qualidade). É conservador e reduz
divergência; fica registrado no `ROADMAP.md` como melhoria candidata, não como bug a
corrigir agora.

### 3.4 PNG com perda — quantizador próprio (decisão 5)

O Sharp faz `png({ quality, palette: quality < 88 })` — quantização com perda para
paleta indexada. **Não existe quantizador na família jSquash** (confirmei:
`@jsquash/imagequant` retorna 404).

Pipeline:

```
quality < 88 ?  quantizador próprio (≤256 cores)  →  @jsquash/png (encode)
             →  @jsquash/oxipng (optimise, level 1 — reduz o color type
                para paleta indexada ao detectar ≤256 cores)
quality ≥ 88 ?  @jsquash/png (encode)  →  @jsquash/oxipng (level 1)
```

> **Revisto após o spike — duas mudanças.**
>
> **`image-q` saiu.** Medido em `SPIKE.md` §5.3: 13,6 s por imagem de 12MP no Chromium e
> 32 s no Firefox, já na variante otimizada com paleta amostrada. Uma pasta com 30 PNGs
> levaria 7 minutos no Chromium. Inviável.
>
> **`oxipng` cai do nível 2 para o nível 1.** Medido em §5.2: os dois entregam
> praticamente os mesmos bytes (15.689.685 vs 15.678.017, diferença de 0,07%), mas o
> nível 2 custa 62% mais tempo no Chromium e 118% mais no Firefox.

**O quantizador próprio**, em `src/engine/image/quantize.ts`:

1. **Histograma sobre amostra.** Percorre 1 a cada N pixels (N escolhido para amostrar
   ~500k pixels no máximo) acumulando num histograma RGB de 15 bits (5 bits por canal,
   32.768 baldes). Amostrar é seguro aqui: a distribuição de cores de uma foto não muda
   materialmente com 1/8 dos pixels.
2. **Median cut** sobre os baldes ocupados até obter `n` caixas, onde `n` deriva da
   qualidade (256 em q=87, descendo até 32 em q=24 — mapeamento tabelado e testado).
   Cada caixa vira uma cor de paleta pela média ponderada por população.
3. **LUT de 15 bits.** Uma tabela `Uint8Array(32768)` mapeia cada balde ao índice da cor
   de paleta mais próxima, calculada uma única vez.
4. **Aplicação.** Um lookup por pixel — `lut[(r>>3)<<10 | (g>>3)<<5 | (b>>3)]`. Sem
   dithering na v1, como o `palette: true` do Sharp em seu modo padrão.
5. **Alfa.** Preservado por limiar: pixels com `a < 128` viram totalmente transparentes,
   os demais totalmente opacos. É o que o formato indexado suporta sem canal alfa
   completo, e evita a bomba de tamanho de um PNG RGBA.

Estimativa: **200–400 ms a 12MP**, contra 13,6 s do `image-q` — a etapa cara do
`image-q` é a aplicação com dithering pixel a pixel, que a LUT elimina. A estimativa
será verificada no Incremento 3; se não se confirmar, a decisão volta à mesa.

É código puro sobre typed arrays, sem WASM e sem DOM — logo, testável na mesma suíte do
`strategy.ts`.

Nota de escopo: o formato padrão é `smart`, que converte PNG → WebP. Esse caminho só é
exercido quando o usuário escolhe PNG explicitamente ou usa "manter original" com
entrada PNG, **e** puxa a qualidade abaixo de 88.

### 3.5 TIFF — removido

Não há decoder TIFF no jSquash e `createImageBitmap` não decodifica TIFF em Chrome nem
Firefox (apenas Safari). Sai da lista de entrada. O README e a UI dirão isso
explicitamente; um `.tif` arrastado recebe erro claro, não falha silenciosa.

### 3.6 AVIF — `speed: 8` e contenção do custo

O encoder AVIF tem 3,4 MB de WASM e é o mais lento da família. O modo meta pode disparar
até 56 encodes por imagem.

**A contenção decisiva é o parâmetro `speed`.** Medido em `SPIKE.md` §5.1, a 12MP:

| `speed`         | Chromium  | Firefox    | bytes   |
| --------------- | --------- | ---------- | ------- |
| 6               | 9,5 s     | 88,9 s     | 511.011 |
| **8 ← adotado** | **1,5 s** | **13,6 s** | 443.011 |
| 10              | 1,1 s     | 10,8 s     | 453.221 |

`speed: 8` é 6,3× mais rápido e é o que torna o AVIF viável. O arquivo sai 13% menor,
mas isso não é ganho gratuito: cada preset de velocidade interpreta a qualidade nominal
de forma diferente, então é outro ponto de operação, não um encoder melhor.

**Consequência de fidelidade:** o Sharp usava `effort: 5`, mais próximo de `speed: 6`.
Com `speed: 8` o AVIF se afasta do app Electron mais que os outros formatos — por isso
ele fica **fora da banda de ±10%** do critério de aceite #2 e é tratado como melhor
esforço, com a razão documentada no README.

Contenções complementares, em ordem de eficácia:

1. **Decodificar uma vez.** O app desktop re-decodifica o arquivo a cada tentativa (até
   56 vezes); nós decodificamos uma vez e mantemos o `ImageData`. Medido: é o que faz o
   modo meta ficar **mais rápido que o app desktop** no Chromium (`SPIKE.md` §6).
2. **Cachear o `ImageData` redimensionado por nível de escala** — 8 resizes em vez de 56.
3. **Saída antecipada da busca binária** (§3.1) — ~14% menos encodes, sem mudar o
   resultado.
4. **Carregamento sob demanda.** O `avif_enc.wasm` só é buscado quando o job realmente
   produz AVIF. Nunca entra no bundle inicial — requisito também para o Lighthouse ≥90.
5. **Guarda de orçamento de tempo** (§2.2.1) — o teto de 20 s protege o Firefox.
6. **Aviso na UI** quando AVIF + modo meta forem combinados em arquivos grandes.

Carta na mão, se voltar a incomodar: buscar numa proxy reduzida a 1/4 da área e fazer só
o encode final em tamanho cheio. Medido em 259 ms no Chromium, mas desnecessário com
`speed: 8`.

### 3.6.1 `target_size` do libwebp — testado e rejeitado

Na Etapa 1 sinalizei o `target_size` nativo do libwebp como possível substituto da busca
binária. **Medido e rejeitado** (`SPIKE.md` §5.4), por dois motivos:

- **Estoura a meta.** Na meta de 0,5 MB devolveu 513 KB contra alvo de 512 KB. Uma
  funcionalidade de "meta de tamanho" que entrega acima da meta está quebrada.
- **O ganho é de 1,6×, não 7×** — o libwebp faz sua própria busca multi-passo
  internamente. Não é um encode; são vários disfarçados de um.

A busca binária do app Electron fica.

**Registrado para a Fase 3:** verifiquei em `avif/encode.js` que o pacote troca
automaticamente para `avif_enc_mt.wasm` (multi-thread) quando `wasm-feature-detect`
detecta threads. Hoje isso não dispara. Mas a Fase 3 (`ffmpeg.wasm`) exige COOP/COEP —
no dia em que esses headers forem ligados, cada worker do nosso pool passa a abrir seu
próprio pool de threads. Vai para o `ROADMAP.md` como pré-condição, não para ser
descoberto lá na frente.

### 3.7 OPFS — fora da v1, com justificativa

O brief pede que eu investigue. **Decisão: não entra na v1.**

Os resultados são mantidos como `Blob`. Chrome, Firefox e Safari já respaldam blobs
grandes em disco automaticamente — o problema que o OPFS resolveria já é resolvido pela
implementação de `Blob`. Adotá-lo agora custaria plumbing de quota, limpeza e
sincronização entre workers por ganho marginal.

Fica no `ROADMAP.md` como pré-requisito da **Fase 3**, onde os arquivos são de GB e o
argumento se inverte.

---

## 4. Entrada e saída de arquivos

### 4.1 Entrada

Três caminhos, todos preservando caminho relativo quando existe:

| Caminho             | Mecanismo                                                             | Estrutura relativa |
| ------------------- | --------------------------------------------------------------------- | ------------------ |
| Arrastar arquivos   | `DataTransfer.files`                                                  | —                  |
| Arrastar **pastas** | `DataTransferItem.webkitGetAsEntry()` + varredura recursiva           | preservada         |
| Botão "selecionar"  | `<input type="file" webkitdirectory multiple>` → `webkitRelativePath` | preservada         |

É assim que o comportamento de "varredura recursiva preservando a estrutura relativa de
subpastas" do app desktop sobrevive na web.

### 4.2 Saída

- **Padrão:** download individual (`URL.createObjectURL` + `<a download>`, com `revoke`
  no `onclick` seguinte) e "Baixar tudo (.zip)" via `fflate`. O zip é montado **num
  worker dedicado**, com `zip()` assíncrono — nunca na thread principal. Caminhos
  relativos preservados dentro do arquivo.
- **Progressive enhancement:** se `window.showDirectoryPicker` existir, oferecemos
  salvar direto numa pasta, recriando a árvore com
  `getDirectoryHandle(nome, { create: true })`. Se não existir, cai no download comum
  sem alarde e sem mencionar o recurso.

---

## 5. Design system — emendas aprovadas

O brand board reprova no WCAG AA em quatro pares que ele efetivamente usa. Com o aval
de que o design system não é intocável, aplico o **mínimo necessário**, preservando a
identidade. Os valores foram calculados, não estimados.

| Onde                                              | Antes                           | Depois        | Contraste                                       |
| ------------------------------------------------- | ------------------------------- | ------------- | ----------------------------------------------- |
| Texto sobre Signal (botão primário, badge `−86%`) | `#04624A` — 3,76:1 ❌           | **`#023B2C`** | **6,44:1** ✅                                   |
| Slate no modo escuro (texto secundário)           | `#6B716D` — 3,91:1 sobre Ink ❌ | **`#8A908C`** | **5,99:1** sobre Ink · 5,22:1 sobre Graphite ✅ |
| Mensagem de erro em superfície clara              | `#FF4D4D` — 3,27:1 ❌           | **`#D93030`** | 4,54:1 ✅                                       |

Notas:

- Escolhi `#023B2C` em vez de trocar para Ink (`#0B0D0C`, 9,95:1) porque mantém o texto
  do botão **verde**, que é a leitura de marca do board. `#04624A` continua existindo
  como token — segue válido sobre branco (7,37:1) e é onde ele é usado no board fora do
  botão.
- `#FF4D4D` **permanece inalterado** como cor de borda e de ícone: 3,27:1 satisfaz o
  mínimo de 3:1 para elementos não-textuais (WCAG 1.4.11). Só o texto da mensagem muda.
- No modo escuro, Signal puro sobre Ink já dá 9,95:1 — nenhuma mudança necessária lá.

Cada emenda vira uma variável separada no `@theme` (ex.: `--color-on-signal`,
`--color-slate-dark`), com um comentário citando o valor original do board e a razão.
As emendas ficam listadas em `docs/brand/DESVIOS.md` para que o board permaneça a fonte
e o desvio seja rastreável.

**Tokens extraídos do board que o brief não lista** e que vão para o `@theme`:

- Tracking por nível: Display −0,04em · H1 −0,035em · H2 −0,025em · H3 −0,01em
- Raios: card 14px · bloco 12px · card de arquivo 10px · botão 9px · thumb 8px ·
  badge 5–6px · chip 999px
- Alturas de controle: 42px (botão/segmented/input) · 34px (chip, botão pequeno) ·
  32px (nav) · 30px (selo) · 26px (badge de %)
- Dropzone: borda 1,5px tracejada; ativo `#00D47E` sobre `rgba(0,212,126,0.07)`
- Barra de progresso: 3px, trilho Line, preenchimento Signal
- Modo escuro: superfície Ink, cards Graphite, **bordas também Graphite** (o board não
  tem token de borda escura separado)

**Ícones:** o board traz 8 SVGs autorais com traço 1,5px. Cinco têm equivalente no
lucide; três não — _comprimir_, _converter_ e _PDF_. Esses três viram componentes
próprios em `src/components/icons/`, com o mesmo grid de 24px e traço de 1,5px. Não é
misturar família: é completar a que já existe.

---

## 6. Inventário de dependências — versões verificadas em 25/07/2026

### 6.1 Dois achados que mudam o que o brief presume

**⚠ TypeScript: usar 6.0.3, não 7.x.** O `latest` do npm hoje é **7.0.2** (a porta em
Go). Mas `typescript-eslint@8.65.0` declara peer `typescript: ">=4.8.4 <6.1.0"` — com TS
7 o lint quebra. **TypeScript 6.0.3** é estável, atual e compatível. Revisitamos quando
o typescript-eslint suportar a linha 7.

**⚠ lucide-react saltou de 0.475 para 1.27.0 e removeu os aliases depreciados.** Cinco
ícones usados hoje em `App.tsx` **não existem mais**:

| Antes           | Agora            |
| --------------- | ---------------- |
| `Loader2`       | `LoaderCircle`   |
| `CheckCircle2`  | `CircleCheckBig` |
| `AlertTriangle` | `TriangleAlert`  |
| `XCircle`       | `CircleX`        |
| `ImageIcon`     | `Image`          |

Sem impacto prático aqui — a UI é nova — mas é a razão pela qual não se pode copiar
imports do código antigo.

### 6.2 Runtime

| Pacote                | Versão  | Papel                                 |
| --------------------- | ------- | ------------------------------------- |
| `next`                | 16.2.12 | App Router, SSG, `output: 'export'`   |
| `react` / `react-dom` | 19.2.8  |                                       |
| `zustand`             | 5.0.14  | Estado da fila                        |
| `lucide-react`        | 1.27.0  | Ícones ⚠ ver §6.1                     |
| `fflate`              | 0.8.3   | ZIP de saída                          |
| `@jsquash/jpeg`       | 1.6.0   | mozjpeg — enc 246 KB                  |
| `@jsquash/png`        | 3.1.1   | PNG — 177 KB                          |
| `@jsquash/webp`       | 1.5.0   | libwebp — enc 275 KB (338 KB SIMD)    |
| `@jsquash/avif`       | 2.1.1   | libavif — enc **3,4 MB**, sob demanda |
| `@jsquash/resize`     | 2.1.1   | lanczos3 — 34 KB                      |
| `@jsquash/oxipng`     | 2.3.0   | Otimização PNG lossless — 160 KB      |

~~`image-q` 4.0.0~~ — **removido após o spike.** A quantização passa a ser código
próprio (§3.4). Nenhuma dependência a mais entra no lugar.

### 6.3 Desenvolvimento

| Pacote                                 | Versão    | Nota                             |
| -------------------------------------- | --------- | -------------------------------- |
| `typescript`                           | **6.0.3** | ⚠ não 7.x — ver §6.1             |
| `tailwindcss` + `@tailwindcss/postcss` | 4.3.3     | tokens via `@theme`              |
| `eslint`                               | 10.8.0    |                                  |
| `eslint-config-next`                   | 16.2.12   | peer `eslint >=9`                |
| `typescript-eslint`                    | 8.65.0    | peer `typescript >=4.8.4 <6.1.0` |
| `prettier`                             | 3.9.6     |                                  |
| `vitest`                               | 4.1.10    |                                  |
| `@testing-library/react`               | 16.3.2    |                                  |
| `jsdom`                                | 29.1.1    |                                  |
| `@playwright/test`                     | 1.62.0    | E2E em Chrome, Firefox e WebKit  |

Nenhuma dependência de analytics, telemetria ou script de terceiros. O produto promete
privacidade; qualquer script externo contradiz a promessa.

---

## 7. Estrutura de pastas

Parte da base do brief §6, com três acréscimos justificados abaixo.

```
/app
  layout.tsx                    # fontes, tema, <html lang="pt-BR">
  page.tsx                      # home
  /comprimir-imagem/page.tsx    # landing por ferramenta (SEO)
  /converter-webp/page.tsx
  /converter-avif/page.tsx
/src
  /components
    /brand      Logo.tsx · PrivacyBadge.tsx
    /icons      CompressIcon.tsx · ConvertIcon.tsx · PdfIcon.tsx      ← §5
    /ui         Button · Chip · Slider · SegmentedControl · StatCard · ThemeToggle
    /queue      Dropzone · FileCard · QueueList · ActionBar
  /engine
    /core       types.ts · registry.ts · pool.ts · orchestrator.ts · budget.ts
    /image      engine.ts · strategy.ts · codecs.ts · decode.ts · naming.ts · quantize.ts
    /workers    image.worker.ts · zip.worker.ts
  /lib          formatBytes · formatPercent · download · fsAccess · cn
  /store        queue.ts
/docs
  /brand        Compressify Brand Board.dc.html · support.js · DESVIOS.md
  PLANO.md · ROADMAP.md · ARQUITETURA.md · SPIKE.md
/tests
  /unit         strategy · naming · format · budget · quantize
  /e2e          queue.spec.ts · privacy.spec.ts
  /fixtures     imagens de referência + resultados do app Electron
```

Acréscimos ao proposto no brief:

- **`/src/components/icons`** — os três ícones do board sem equivalente no lucide (§5).
- **`/src/engine/core/budget.ts`** — o orçamento de megapixels (§2.1) é lógica pura e
  testável; separá-lo do pool mantém o pool focado em ciclo de vida de worker.
- **`/tests/fixtures`** — imagens de referência **e** a saída do app Electron sobre
  elas, que é como o critério de aceite #2 deixa de ser subjetivo.

---

## 8. Testes e CI

**Unitários (Vitest) — onde importa, conforme o brief §7:**

- `strategy.test.ts` — o núcleo. Casos de borda exigidos: arquivo já menor que a meta,
  meta impossível, imagem menor que 900px. Mais: meta exatamente igual ao original
  (a regra dos 98%), qualidade pedida coincidindo com um degrau da escada, e a prova de
  equivalência da saída antecipada da busca binária (§3.1).
- `naming.test.ts` — sufixo `-compressify`, colisão, incremento de índice, caminho
  relativo preservado.
- `budget.test.ts` — despacho sob pressão de memória, job maior que o orçamento.
- `format.test.ts` — `smart` e `original` sobre cada extensão de entrada.
- `quantize.test.ts` — imagem com ≤256 cores fica idêntica; imagem de cor contínua cai
  para o número certo de cores; alfa por limiar; mapeamento qualidade → nº de cores.

Sem perseguir cobertura em componentes de UI.

**E2E (Playwright), em Chrome, Firefox e WebKit:**

- `queue.spec.ts` — arrastar N imagens, verificar progresso individual, cancelar no
  meio, baixar o ZIP.
- `privacy.spec.ts` — **automatiza o critério de aceite #3**: intercepta todas as
  requisições e falha se qualquer corpo contiver bytes do arquivo de teste. O
  diferencial do produto vira um teste que roda em cada PR, não uma promessa.

**Scripts:**

```json
"check": "npm run typecheck && npm run lint && npm run test -- --run"
```

**GitHub Actions:** workflow rodando `npm run check` em cada PR, mais um job separado
de Playwright (que precisa de browsers instalados e é mais lento).

---

## 9. Plano de migração do repositório

O repo `github.com/Igorpcferreira/compressify` **existe e está vazio** (`git ls-remote`
não retorna refs). A pasta local `Compressify/` hoje **não é um repositório git** — ela
está solta dentro de um repo cuja raiz é `C:/Users/user`.

Proposta, **para sua aprovação — não executo nada disto sem seu "pode ir"**:

```bash
# 1. repositório próprio
cd Compressify/ && git init -b main
git remote add origin https://github.com/Igorpcferreira/compressify.git

# 2. o Electron entra como commit inicial e ganha um marco
#    (.gitignore já exclui release/ 401 MB, out/, node_modules/)
git add . && git commit -m "feat: aplicativo desktop Electron de compressão de imagens"
git tag -a v1.0.0-electron -m "Última versão desktop, Electron + Sharp"
git branch legacy/electron

# 3. main recebe a refatoração web; legacy/electron preserva o marco
git push -u origin main && git push origin legacy/electron --tags
```

Uma correção ao brief §8: **não há histórico do Electron a preservar** — nunca houve
commit. A tag e a branch marcam um snapshot criado agora. Continua valendo (o código é
trabalho válido e o README deve citar a origem), mas é honesto chamar pelo nome.

### 9.1 Recomendação separada, de segurança

O repositório com raiz em `C:/Users/user` tem sua home inteira como working tree:
`.ssh/`, `.gnupg/`, `.claude.json` e `AppData/` aparecem todos como untracked. Um
`git add -A` acidental ali comitaria suas chaves privadas.

Não faz parte desta refatoração e não vou mexer nisso por conta própria. Mas é a única
coisa que encontrei que eu classificaria como urgente, e prefiro dizer.

---

## 10. Incrementos entregáveis

Um por vez. Ao fim de cada um: mostro o diff, rodo `npm run check`, e **paro para você
validar antes de qualquer commit**.

| #         | Incremento                              | Entrega                                                                                                                      | Por que nesta ordem                         |
| --------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| ~~**0**~~ | ~~**Spike do motor**~~ ✅ **CONCLUÍDO** | [`docs/SPIKE.md`](SPIKE.md) — veredito **GO**, com quatro correções a este plano                                             | Era o maior risco. Resolvido                |
| **1**     | Fundação                                | Next 16 + TS 6 + Tailwind 4 com o `@theme` completo, ESLint/Prettier, `npm run check`, CI, migração do repo (após aprovação) | Base de qualidade antes do código           |
| **2**     | Algoritmo puro                          | `strategy.ts` + `naming.ts` + suíte de testes, **sem WASM**                                                                  | O ativo do projeto, testado isoladamente    |
| **3**     | Motor de imagem                         | `ImageEngine`: decode híbrido, codecs, resize, quantização PNG                                                               | Fecha o motor rodando de verdade            |
| **4**     | Concorrência                            | Worker, pool, orçamento de memória, cancelamento, progresso                                                                  | Motor virando serviço utilizável            |
| **5**     | Fila e UI                               | Store, Dropzone (com teclado), FileCard, QueueList, ActionBar                                                                | O componente-assinatura merece foco isolado |
| **6**     | Saída                                   | Download individual, ZIP em worker, File System Access                                                                       |                                             |
| **7**     | Acabamento                              | Landings de SEO, modo escuro completo, a11y, Lighthouse, E2E nos 3 navegadores                                               |                                             |
| **8**     | Documentação                            | README novo com screenshot, `ARQUITETURA.md` com o diagrama, `ROADMAP.md`, favicon/ícones/OG                                 | Peça de portfólio, escrita com esse peso    |

O Incremento 0 é o único que pode invalidar o plano. Por isso é o primeiro e por isso
entrega números, não código de produção.

---

## 11. Riscos abertos

| Risco                                                            | Situação            | Mitigação                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AVIF lento demais                                                | ✅ **Resolvido**    | `speed: 8` — 6,3× mais rápido (§3.6)                                                                                                                                                                                 |
| WASM do jSquash não empacotar bem                                | 🟡 **Parcial**      | Resolvido para Vite/Rollup: build limpa, `.wasm` emitidos, codecs rodam dentro de Worker. **Turbopack ainda a verificar no Incremento 1**. Plano B: copiar para `/public` e usar o `init(url)` que os pacotes expõem |
| **Desempenho do Firefox (3–10× mais lento)**                     | 🔴 **Novo, aberto** | Guarda de tempo (§2.2.1), pool adaptativo (§2.1), degradação documentada no README                                                                                                                                   |
| `eslint-config-next` 16 com ESLint 10                            | 🟡 Aberto           | Peer declara `>=9`. Verifico na instalação do Incremento 1                                                                                                                                                           |
| Safari / WebKit não medido                                       | 🟡 Aberto           | Não entrou no spike. Rodar a mesma bateria no WebKit durante o Incremento 1                                                                                                                                          |
| Quantizador próprio não atingir 200–400 ms                       | 🟡 Aberto           | Verificar no Incremento 3. Se falhar, volta à mesa com as opções B e C do `SPIKE.md` §8                                                                                                                              |
| `@jsquash/avif` falhou uma vez no Firefox sob pressão de memória | 🟡 Aberto           | Retentativa de worker no pool (§2.2)                                                                                                                                                                                 |

---

**Plano aprovado em 25/07/2026.** Migração do repositório executada; Incremento 0
concluído. Estado atual e próximos passos em [`HANDOFF.md`](HANDOFF.md).
