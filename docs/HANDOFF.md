# Handoff — estado do projeto e o que vem a seguir

> Documento de continuidade. Quem retomar o Compressify (pessoa ou sessão nova de
> IA) deve ler **este arquivo primeiro** e só então mergulhar no `PLANO.md`.
>
> Última atualização: 26/07/2026, ao fim do **Incremento 12**. A Fase 1 está
> concluída e as melhorias independentes de fase também: 348 testes de unidade
> e 97 E2E em Chromium, Firefox e WebKit.
>
> Tudo está comitado e publicado em `origin/main`.
>
> **Os 10 critérios de aceite estão fechados** (§15). O último — a comparação
> numérica do modo meta com o app Electron — foi medido no Incremento 9 e deu
> **+0,4% no pior caso**, com dois casos idênticos ao byte:
> [`COMPARACAO-ELECTRON.md`](COMPARACAO-ELECTRON.md).
>
> **Sete dos oito itens do [`ROADMAP.md`](ROADMAP.md) foram feitos** nos
> Incrementos 9 a 12 (§17). O que resta antes da Fase 2 é **o deploy** — e a
> conferência do `Content-Type` da imagem de Open Graph depois dele (§10).

---

## 1. Regras de trabalho (valem para qualquer sessão)

Estas vieram do brief do Igor e não expiram:

1. **Nunca fazer `git commit` ou `git push` sem autorização explícita dele.** Ao fim de
   um bloco de trabalho: mostrar `git status` e `git diff --stat`, rodar
   `npm run check`, sugerir a mensagem de commit e **esperar**.
2. **Um incremento por vez.** Terminar, mostrar, parar, esperar validação.
3. **Discordar quando algo estiver tecnicamente errado**, com argumento, antes de
   implementar. O Igor prefere discussão a execução cega — e já mudou de decisão duas
   vezes diante de dados (`image-q`, contrastes do design system).
4. **Verificar versões antes de fixar dependências.** A data de conhecimento do modelo
   pode estar defasada. Isso já pegou três armadilhas reais (§12).
5. **Medir antes de afirmar.** O spike derrubou quatro suposições do plano, duas delas
   minhas. Números > intuição.

---

## 2. Onde o projeto está

Repositório: **github.com/Igorpcferreira/compressify** · branch `main`

```
4c9e522  feat: aplicativo desktop Electron  ← tag v1.0.0-electron + branch legacy/electron
ce0db85  docs: plano técnico e spike do motor
14416a4  feat: fundação do app web (Next 16, TS 6, Tailwind 4)
e6590df  feat(engine): porta o algoritmo como código puro e testável
3ebdc32  docs: handoff com estado do projeto e próximos incrementos
c79a7d8  feat(engine): motor de imagem real, com codecs verificados de ponta a ponta
0bd318c  feat(engine): concorrência — worker, pool com orçamento de memória e fila
a6aef39  feat(ui): a fila ganha tela — store, dropzone, cards e preferências
94023db  feat(saida): download individual, ZIP em worker e salvar em pasta
a42a1c2  feat(acabamento): landings de SEO, acessibilidade e E2E nos três navegadores
2dc4f6d  docs: README, arquitetura e roadmap — a Fase 1 fica documentada
99790f8  test(paridade): o critério de aceite #2 vira número — +0,4% contra o Electron
1c746c0  feat(preferências): perfis de saída e preferências que sobrevivem à aba
658bcf6  feat(ui): comparação antes/depois e o progresso do lote no título da aba
5b645aa  feat(pwa): o app funciona sem rede — e os metadados nunca sobreviveram
```

| Incremento                                   | Estado                                |
| -------------------------------------------- | ------------------------------------- |
| 0 — Spike do motor                           | ✅ concluído · [`SPIKE.md`](SPIKE.md) |
| 1 — Fundação                                 | ✅ concluído                          |
| 2 — Algoritmo puro + testes                  | ✅ concluído                          |
| 3 — Motor de imagem real                     | ✅ concluído · 168 testes             |
| 4 — Worker, pool, cancelamento               | ✅ concluído · 235 testes             |
| 5 — Store, fila e UI                         | ✅ concluído · 269 testes             |
| 6 — Saída: download, ZIP, File System Access | ✅ concluído · 309 testes             |
| 7 — Acabamento: SEO, modo escuro, a11y, E2E  | ✅ concluído · 60 E2E                 |
| 8 — Documentação e ícones                    | ✅ concluído                          |
| **9 — Paridade medida com o Electron**       | ✅ **concluído · §17**                |
| **10 — Perfis e preferências persistidas**   | ✅ **concluído · §18**                |
| **11 — Antes/depois e progresso na aba**     | ✅ **concluído · §19**                |
| **12 — PWA, uso offline e a prova do EXIF**  | ✅ **concluído · §20**                |

`npm run check` (typecheck + lint + formatação + 348 testes) passa limpo em ~50 s — dos
quais ~20 s são a comparação com o app Electron (§17), que roda com os codecs WASM **e**
o `sharp` nativo.
`npm run e2e` roda 97 testes em Chromium, Firefox e WebKit em ~1,5 min — exige
`npx playwright install` e um `npm run build` antes.
`npm run paridade` reescreve [`COMPARACAO-ELECTRON.md`](COMPARACAO-ELECTRON.md) a partir
da medição.
`npm run build` gera exportação estática sem nenhuma serverless function — **agora com
webpack, não Turbopack**. O porquê está na §4.

### O que já existe em código

```
app/
  layout.tsx          fontes via next/font (auto-hospedadas), metadata, ThemeScript
  page.tsx            ▲ a home
  comprimir-imagem/ · converter-webp/ · converter-avif/   ◇ landings de SEO
  sitemap.ts · robots.ts · icon.svg · opengraph-image.tsx ◇ gerados na build
  manifest.ts         ○ o manifesto do app instalável
  globals.css         design system inteiro em @theme + camada semântica de tema
src/
  components/theme/ThemeScript.tsx     resolve o tema antes da primeira pintura
  components/theme/ThemeToggle.tsx     ▲ alterna claro/escuro sem flash
  components/brand/                    ▲ Logo · PrivacyBadge
  components/ui/                       ▲ Button · SegmentedControl · Chip · Slider
  components/queue/                    ▲ Dropzone · FileCard · QueueList · ActionBar
                                         OptionsPanel · RejectedNotice · QueueWorkspace
  components/queue/CompareDialog.tsx   ◆◆ antes/depois em <dialog> nativo
  components/queue/useTitleProgress.ts ◆◆ a contagem do lote no título da aba
  components/pwa/RegisterServiceWorker.tsx  ○ registra o sw, só em produção
  lib/defaults.ts                      ◈◈ padrões e faixas — módulo folha
  lib/preferences.ts                   ◈◈ localStorage validado campo a campo
  lib/profiles.ts                      ◈◈ web · e-mail · impressão
  store/queue.ts                       ▲ a store Zustand ligada ao orquestrador
  lib/files.ts                         ▲ drop de pastas, varredura recursiva, colar
  lib/cn.ts                            ▲ junção de classes, 12 linhas
  lib/download.ts                      ● download individual e nome do ZIP
  lib/archive.ts                       ● conversa com o worker de ZIP
  lib/fsAccess.ts                      ● salvar numa pasta, quando o navegador deixa
  lib/site.ts                          ◇ a URL canônica, numa fonte só
  components/landing/                  ◇ ToolPage · StructuredData
  engine/core/types.ts                 contratos (CompressionEngine, JobResult…)
  engine/core/registry.ts              resolve o motor por arquivo
  engine/core/naming.ts                ◆ unicidade de caminho, genérica
  engine/core/budget.ts                ◆ workers por núcleo, megapixels em voo
  engine/core/pool.ts                  ◆ despacho, cancelamento, retentativa
  engine/core/orchestrator.ts          ◆ a fila que a UI conversa
  engine/workers/protocol.ts           ◆ o contrato de mensagens dos dois lados
  engine/workers/runner.ts             ◆ o que o worker faz — testável em Node
  engine/workers/image.worker.ts       ◆ a ligação com `self`, e nada mais
  engine/workers/spawn.ts              ◆ `new Worker(new URL(…))` + pool pronto
  engine/workers/zip-protocol.ts       ● o contrato do worker de ZIP
  engine/workers/zip-runner.ts         ● monta o ZIP em fluxo, sem recomprimir
  engine/workers/zip.worker.ts         ● a ligação com `self`
  engine/image/strategy.ts             ★ o algoritmo portado — núcleo do projeto
  engine/image/quantize.ts             ★ quantizador próprio (median cut + LUT)
  engine/image/probe.ts                ★ lê cabeçalho (formato, dimensões, bits)
  engine/image/decode.ts               ★ decode híbrido nativo/WASM
  engine/image/codecs.ts               ★ encode e resize, carregados sob demanda
  engine/image/engine.ts               ★ ImageEngine: supports/probe/process
  engine/image/format.ts               smart/original → formato concreto
  engine/image/naming.ts               sufixo -compressify, colisões, caminho relativo
  engine/image/support.ts              ▲ o que é aceito e por que o resto não é
  lib/format.ts                        formatBytes/formatPercent em pt-BR
tests/
  helpers/images.ts                    construtores de cabeçalho, File e foto sintética
  helpers/codecs-node.ts               inicializa os codecs reais em Node
  helpers/workers.ts                   ◆ workers de mentira, dirigidos pelo teste
  helpers/electron-reference.ts        ◇◇ o pipeline do desktop, transcrito
  unit/                                329 testes — lógica, com codecs injetados
  integration/engine-codecs.test.ts    6 testes — o motor com os codecs de verdade
  integration/electron-parity.test.ts  ◇◇ 9 testes — os dois produtos lado a lado
  integration/metadata.test.ts         ○ 4 testes — o EXIF não sobrevive
  e2e/                                 ◇ 32 testes × 3 navegadores, contra out/
  e2e/fixtures.ts                      ◇ PNGs montados à mão, com marcador
  e2e/preferencias.spec.ts             ◈◈ persistência e perfis num navegador
  e2e/comparar.spec.ts                 ◆◆ o <dialog> e o título da aba
  e2e/offline.spec.ts                  ○ comprime sem rede
README.md                              ◈ o que é, os números, como rodar
scripts/serve-out.mjs                  ◇ serve out/ para o E2E e o Lighthouse
scripts/screenshot.mjs                 ◈ regenera a captura do README
scripts/paridade.mjs                   ◇◇ reescreve COMPARACAO-ELECTRON.md
scripts/gerar-sw.mjs                   ○ gera o service worker a partir do out/
docs/                                  PLANO, SPIKE, HANDOFF, ARQUITETURA,
                                       ROADMAP, COMPARACAO-ELECTRON, brand/, imagens/
```

`★` é o Incremento 3, `◆` o 4, `▲` o 5, `●` o 6, `◇` o 7, `◈` o 8,
`◇◇` o 9, `◈◈` o 10, `◆◆` o 11 e `○` o 12.

Dependências do Incremento 3, todas conferidas contra o `latest` do npm em 25/07/2026
(as seis coincidiram com o que o plano previa):

```
@jsquash/jpeg 1.6.0 · @jsquash/png 3.1.1 · @jsquash/webp 1.5.0
@jsquash/avif 2.1.1 · @jsquash/resize 2.1.1 · @jsquash/oxipng 2.3.0
```

Dos Incrementos 5 e 6, conferidas contra o `latest` do npm em 26/07/2026 — as três
bateram com o que o `PLANO.md` §6.2 previa:

```
zustand 5.0.14 · lucide-react 1.27.0 · fflate 0.8.3 · @playwright/test 1.62.0
```

---

## 3. Números do spike que **não** precisam ser remedidos

Tudo em `SPIKE.md`. Os que mais importam para as decisões seguintes:

| Fato                                              | Valor                                                       |
| ------------------------------------------------- | ----------------------------------------------------------- |
| AVIF: usar `speed: 8`, nunca 6                    | 6,3× mais rápido (12MP: 1,5 s vs 9,5 s no Chromium)         |
| `oxipng`: usar nível 1, nunca 2                   | mesmos bytes, 40–55% mais rápido                            |
| Firefox roda WASM 3–10× mais devagar que Chromium | confirmado com linha de base em JS puro                     |
| `target_size` do libwebp                          | **rejeitado** — estoura a meta (513 KB para alvo de 512 KB) |
| Decode nativo vs WASM                             | 1,0–2,8× no Chromium, 2,9–6,9× no Firefox                   |
| Encode WebP 12MP q75                              | 1,2 s Chromium · 8,5 s Firefox                              |
| Lote de 50 fotos 12MP, modo auto                  | ~9 s Chromium · ~55 s Firefox                               |

O harness do spike **não está no repositório** (é instrumentação, não produto). Se
precisar remedir, a estrutura está descrita em `SPIKE.md` §10.

---

## 4. A troca de bundler — precisa do seu aval

**`npm run build` passou a usar `next build --webpack`.** É a única mudança do
incremento que não é código de motor, e é a que eu quero que você olhe com atenção.

### Por quê

O build de produção do Turbopack **trava indefinidamente** ao empacotar parte dos
codecs. Não é lentidão: os processos ficam com **0% de CPU** por tempo indeterminado
(a primeira tentativa passou de 20 minutos), na fase "Creating an optimized production
build", antes de emitir qualquer arquivo. É um impasse.

Isolei pacote por pacote, um `next build` por linha:

| Pacote            | Traz variante multi-thread?                  | `--turbopack` | `--webpack` |
| ----------------- | -------------------------------------------- | ------------- | ----------- |
| `@jsquash/jpeg`   | não                                          | ✅ compila    | ✅          |
| `@jsquash/webp`   | não (só SIMD)                                | ✅ compila    | ✅          |
| `@jsquash/resize` | não (hqx e magic-kernel são só variantes)    | ✅ compila    | ✅          |
| `@jsquash/oxipng` | **sim** — `pkg-parallel`, wasm-bindgen-rayon | ❌ **trava**  | ✅          |
| `@jsquash/avif`   | **sim** — `avif_enc_mt`, pthreads emscripten | ❌ **trava**  | ✅          |

A correlação é exata e cobre **dois mecanismos de threading independentes**. O
denominador comum é o worker aninhado que essas variantes criam —
`new Worker(new URL('./…', import.meta.url), { type: 'module' })` — alcançado por dentro
de um import dinâmico.

Detalhe que salva tempo de quem for investigar: **`next dev` compila tudo sem
reclamar**, em 1,9 s, com os cinco codecs importados estaticamente. O problema é
exclusivo do build de produção.

### O que ficou decidido

- **dev continua no Turbopack** (padrão do Next 16, rápido).
- **build de produção usa webpack.** Compila em 44 s, emite os 14 `.wasm` como assets
  estáticos hasheados em `_next/static/media/`, e a exportação continua 100% estática —
  nenhuma function no deploy, que é o que sustenta a promessa de privacidade.
- A razão está comentada no `next.config.ts`, onde quem for mexer no build vai ler.

Se você preferir outro caminho, os que eu descartei: (a) esperar o Turbopack — deixa o
projeto sem build de produção por tempo indeterminado; (b) fixar os pacotes nas versões
`single-thread-only` do npm — são versões 1.x contra as 2.x/3.x atuais, um downgrade
grande para resolver um problema de bundler; (c) copiar os `.wasm` para `/public` e usar
`init(url)` — não resolve, porque o que trava é o **JS de cola**, não o `.wasm`.

Vale registrar que as variantes multi-thread são **código morto hoje**: elas só entram
em ação com `crossOriginIsolated`, que exige COOP/COEP, que nós não ligamos. Elas
passam a importar na Fase 3 (`ffmpeg.wasm`), como o `PLANO.md` §3.6.1 já antecipava.

### Efeito colateral corrigido de quebra

O Turbopack estava inferindo a raiz do workspace como `C:\Users\user`, por causa do
`package-lock.json` que existe lá (o repositório com raiz na home do `PLANO.md` §9.1).
O `next.config.ts` agora fixa `turbopack.root` no diretório do projeto.

---

## 5. O motor foi verificado com codecs reais

O que trava é o **bundler**, não os codecs. Eles rodam em Node — descoberta que
destravou a validação sem depender do Turbopack.

`tests/integration/engine-codecs.test.ts` roda o `ImageEngine` de produção, sem injeção
nenhuma, sobre arquivos gerados pelos próprios encoders:

- JPEG 800×600 → WebP: sai um WebP válido, decodificável, nas dimensões relatadas.
- PNG → JPEG quando o usuário escolhe o formato.
- Modo meta: ou atinge a meta, ou avisa — **nunca entrega acima da meta em silêncio**,
  que é exatamente o defeito que reprovou o `target_size` do libwebp no spike.
- PNG com perda: o número de cores do arquivo de saída cai para ≤ 128 em q=60,
  exatamente o que `paletteSizeForQuality` prescreve. É a prova de que o quantizador
  rodou, e não só de que não quebrou.
- PNG em q=95 continua com mais de 256 cores — o limiar de 88 é respeitado.
- AVIF com `speed: 8` produz um AVIF válido.

Duas exigências de Node, que **não** valem no navegador: o `fetch` não atende `file://`,
então os testes passam os bytes do `.wasm` na mão (`tests/helpers/codecs-node.ts`); e o
`oxipng` faz `data instanceof ImageData`, então o helper declara o `ImageData` mínimo em
vez de depender do polyfill que o glue emscripten injeta por acaso.

### Medições novas

Node 24 / V8 nesta máquina — a mesma família de motor do Chromium:

| Cenário                                       | Resultado                                              |
| --------------------------------------------- | ------------------------------------------------------ |
| JPEG 800×600 → WebP, modo auto                | 148 KB → 128 KB · 13,8% · **117 ms**                   |
| JPEG 1600×1200, meta de 0,05 MB               | 824 KB → 56 KB em 1344×1008 · **3,3 s** · avisa        |
| PNG 1000×750 → PNG q60 (quantizador + oxipng) | 2,3 MB → 392 KB · **82,6%** · 156 ms                   |
| Quantizador real, 64 cores                    | **37 ms** (2MP) · **92 ms** (12MP) · **196 ms** (24MP) |

**O risco do quantizador está fechado.** O `PLANO.md` §11 pedia verificar a estimativa
de 200–400 ms a 12MP: a implementação real faz em **92 ms**, batendo com o protótipo do
spike (96 ms). A decisão de escrever o quantizador em vez de usar `image-q` (13,6 s no
mesmo tamanho) se confirma com folga de duas ordens de grandeza.

O caso da meta merece leitura: 1600×1200 com alvo de 0,05 MB desce um nível de escala
(1344×1008), esbarra no piso de 900px, não alcança os 52.429 bytes e devolve 57.282 com
`status: 'warning'` e a mensagem do limite. É o comportamento correto e é o caso de
borda que o brief §7 exige testar.

### O carregamento sob demanda funciona

Uma página que importa o `ImageEngine` inteiro carrega **zero** código de codec nos
chunks iniciais — verificado procurando `avif_enc`, `mozjpeg_enc`, `webp_enc` e
`squoosh_oxipng` em cada `.js` que o HTML referencia. Os 14 `.wasm` ficam como assets
separados, buscados só quando um job produz aquele formato. É o requisito do
Lighthouse ≥ 90, garantido estruturalmente e não por promessa.

### O que continua sem verificação

- **O caminho de decode nativo** (`createImageBitmap` + `OffscreenCanvas`). Em Node ele
  não existe, então o que os testes exercitam é o **fallback WASM**. O nativo depende de
  navegador e fica para o E2E do Incremento 7.
- **Contexto de worker.** Os codecs rodam hoje na thread do teste; o spike já provou que
  funcionam dentro de Worker, mas o nosso worker é do Incremento 4.
- **Safari/WebKit**, que nunca foi medido.

---

## 6. Decisões de implementação do Incremento 3

Além do que o plano já mandava (decode híbrido, decode único por job, `speed: 8`,
oxipng nível 1, WebP sem `target_size`, resize sempre do original, guarda de 20 s,
progresso monotônico travado em 95%), três escolhas minhas:

1. **`probe.ts` não estava na lista de arquivos** — foi acrescentado. O orçamento de
   megapixels do pool (Incremento 4) precisa das dimensões **antes** do despacho, e a
   alternativa era decodificar 50 arquivos só para medir. São ~200 linhas de leitura de
   cabeçalho (PNG, JPEG, WebP nas três variantes, AVIF), puras, com 20 testes.
   Limitação registrada no arquivo: as dimensões são as _armazenadas_, sem aplicar
   orientação EXIF — para o orçamento dá no mesmo, e o `process()` usa as dimensões do
   decode, que já vêm rotacionadas.

2. **O cache de escala é de um slot só, não um `Map` por nível.** A busca percorre as
   escalas em ordem decrescente e nunca volta a uma anterior, então um slot entrega o
   mesmo ganho (8 resizes no pior caso, não 56) e ainda libera a escala morta na hora.
   Com oito workers segurando `ImageData` de 12MP a ~48 MB cada, isso é a diferença
   entre caber e a aba morrer.

3. **Correção ao plano sobre PNG de 16 bits.** O `PLANO.md` §3.2 diz que o fallback WASM
   "preserva" a profundidade. **Preserva no decoder, não no pipeline** — resize,
   quantização e todos os encoders operam em 8 bits, então os 16 bits morrem no passo
   seguinte de qualquer jeito. O roteamento foi mantido, mas por outro motivo, e está
   documentado assim no `decode.ts`: evita a conversão de espaço de cor e o ida-e-volta
   de alfa premultiplicado do canvas justamente nas imagens onde o banding aparece
   primeiro.

### O que o Incremento 4 herdou

A desambiguação de nomes (`foto-compressify-1.webp`) precisa de um `Set` **por lote**. O
`ImageEngine` aceita esse `Set` por injeção (`new ImageEngine({ taken })`) e cria um
próprio quando ninguém injeta. Como cada worker tem sua própria instância, **o
orquestrador é quem precisa garantir a unicidade global** — senão dois workers geram o
mesmo nome. Resolvido em §7.

---

## 7. O Incremento 4 — o motor virou serviço

O motor do Incremento 3 rodava na thread de quem o chamasse. Agora existem quatro peças
entre ele e a UI, e a thread principal não toca em pixel nenhum:

```
QueueOrchestrator  fila, aceitação na entrada, nomes únicos, cancelamento
      │
  WorkerPool       slots por núcleo · orçamento de megapixels · retentativa
      │  postMessage
  image.worker     runner → registro → ImageEngine → codecs
```

### As decisões que valem discussão

**1. O `probe` roda no worker, não na thread principal.** Ele é quase de graça — lê 64 KB
de cabeçalho e devolve as dimensões — mas o `ImageEngine.probe` **decodifica** quando o
cabeçalho é ilegível (arquivo truncado, variante exótica). Uma foto de 24MP decodificada
na thread principal é a aba travada, que é exatamente o critério de aceite #4. Como o
orçamento do pool precisa das dimensões **antes** do despacho, cada job passa duas vezes
pelo pool: `probe` (custo zero) e depois `run` (custo em megapixels).

**2. A fila é FIFO estrita.** Quando o primeiro da fila não cabe no orçamento, ninguém
passa na frente — mesmo havendo slot livre e orçamento de sobra para um arquivo pequeno.
Deixar os pequenos furarem a fila renderia mais vazão, e faria a foto grande esperar
enquanto o usuário olha um card parado sem explicação. Previsibilidade ganhou de vazão.
Há teste para isso, e ele falha de propósito se alguém mudar de ideia sem querer.

**3. Cancelar tem prazo, e o prazo termina em `terminate()`.** O worker checa o `signal`
entre tentativas de encode; um encode isolado não é interrompível. Se ele não responder
ao `abort` em 2 s, o worker é terminado e o slot sobe um novo no próximo job. Sem isso,
"cancelar" durante um AVIF de 12MP no Firefox demoraria dezenas de segundos.

Um detalhe que só aparece quando se escreve o teste: o worker também precisa **descartar
o resultado** de um job abortado que terminou o encode mesmo assim. Sem isso, um card
cancelado volta sozinho para "concluído".

**4. Retentativa só para falha de execução.** `unsupported` e `aborted` são
determinísticos — retentar é desperdício. Qualquer outra falha ganha uma segunda chance
**com worker novo**, porque a hipótese é módulo WASM em estado ruim. É a mitigação que o
`PLANO.md` §2.2 pedia para o `@jsquash/avif` que quebrou uma vez no Firefox sob pressão
de memória e não reproduziu.

**5. O nome de saída é reservado duas vezes.** Uma dentro do worker (que só enxerga os
jobs daquele worker) e outra no orquestrador, que enxerga o lote. A segunda reserva usa
`reserveUniquePath`, é idempotente quando não há colisão, e é o que fecha a dívida que o
§6 deixou marcada. Dois `foto.jpg` de pastas diferentes saem como
`foto-compressify.webp` e `foto-compressify-1.webp` mesmo tendo sido processados por
workers que não se conhecem.

### Quatro arquivos que o plano não previa

O `PLANO.md` §7 lista `pool.ts`, `orchestrator.ts`, `budget.ts` e `image.worker.ts`.
Entraram mais quatro, todos pequenos e todos pelo mesmo motivo — manter testável o que
seria intestável:

| Arquivo               | Por quê                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `workers/protocol.ts` | O contrato de mensagens é dos **dois** lados. Módulo folha, sem import pesado, senão os codecs entram no bundle inicial pela porta dos fundos |
| `workers/runner.ts`   | Toda a lógica do worker. `image.worker.ts` fica com 4 linhas de ligação com `self`, que é o que não dá para testar em Node                    |
| `workers/spawn.ts`    | A única linha do projeto com `new Worker(new URL(…))`. Isolada porque o Vite e o webpack **seguem** essa URL ao resolver módulos              |
| `core/naming.ts`      | A unicidade de caminho é genérica; o sufixo `-compressify` é do motor de imagem. O orquestrador precisa da primeira sem importar a segunda    |

O `JobError` com `kind` também é escolha e não acidente: o `structuredClone` de um
`Error` **não preserva a subclasse**, então um `AbortedError` chegaria do outro lado como
`Error` genérico e o pool não teria como distinguir cancelamento de falha para decidir se
retenta. O `kind` viaja explicitamente.

### O que os 67 testes novos cobrem

Todos rodam em Node, sem navegador e sem WASM — o pool recebe uma fábrica de workers de
mentira (`tests/helpers/workers.ts`) e o orquestrador recebe um pool de mentira.

- **`budget.test.ts`** (13) — dimensionamento, piso e teto, e a regra que não é óbvia:
  um job maior que o orçamento inteiro **roda**, sozinho, em vez de esperar para sempre.
- **`pool.test.ts`** (19) — ordem de despacho, orçamento segurando a fila, progresso,
  cancelamento na fila e em voo, worker que ignora o `abort` e é terminado, mensagem
  atrasada de worker substituído sendo descartada, retentativa e desistência.
- **`orchestrator.test.ts`** (19) — aceitação e recusa com motivo, custo vindo do probe,
  probe que falha sem condenar o job, eventos na ordem, contagem do lote, cancelamento
  individual e da fila inteira, e os nomes únicos entre workers.
- **`runner.test.ts`** (8) — probe, progresso, abort, o resultado descartado depois do
  cancelamento, e a serialização de erro preservando nome e mensagem.
- **`core-naming.test.ts`** (8) — `splitPath` e `reserveUniquePath`, incluindo caixa
  ignorada (Windows) e idempotência.

### O worker foi verificado no build de produção — e o bundle continua limpo

Nada importa `spawn.ts` ainda (a UI é o Incremento 5), então o webpack não o veria. Para
não empurrar o risco para frente, liguei um componente temporário na home, rodei
`npm run build` e conferi a saída antes de removê-lo:

- o chunk do worker é emitido (`compressify-image.<hash>.js`, 16 KB);
- os 14 `.wasm` continuam como assets separados;
- **nenhum dos 6 scripts que o HTML referencia contém `avif_enc`, `mozjpeg_enc`,
  `webp_enc`, `squoosh_oxipng` ou `avif_dec`** — e o próprio chunk do worker também não:
  os codecs seguem em import dinâmico, carregados só quando um job produz aquele formato.

O Turbopack não foi testado com o worker (o `dev` é dele; o `build` é webpack desde §4).
Vale checar no Incremento 5, quando a UI passar a montar o pool de verdade. **Checado —
§8.**

---

## 8. O Incremento 5 — o produto aparece

A fila deixou de ser API e virou tela: arrastar, escolher preferências, comprimir com
progresso por arquivo, cancelar um ou todos. O que **não** entrou é a saída — download
individual, ZIP e File System Access são o Incremento 6, e o card mostra o resultado sem
botão de baixar até lá.

```
app/page.tsx            HTML estático: cabeçalho, herói, selo, rodapé
  └ QueueWorkspace      o limite do interativo — daqui para baixo é 'use client'
      ├ Dropzone        arrastar · pasta · colar
      ├ RejectedNotice  o que não entrou, com o motivo
      ├ OptionsPanel    modo · meta · formato · qualidade
      ├ ActionBar       resumo do lote + comprimir/cancelar/limpar
      └ QueueList → FileCard × N
```

### A invariante que sustenta a escolha do Zustand

O `PLANO.md` §1.4 escolheu Zustand por um argumento de re-render, e um argumento não
verificado é uma opinião. Ele agora é teste:

- `items` é um **mapa por id**. Um evento de progresso troca a referência de um item e
  de mais nenhum, então o card dos outros 49 arquivos não repinta.
- `stats` é **estado**, não seletor derivado — recalculado quando um job entra, sai ou
  termina, nunca a cada 1%. Um seletor que devolvesse `{...}` novo a cada leitura
  repintaria a lista inteira 100 vezes por arquivo.
- `QueueList` assina **só o array de ids**; o item inteiro é lido dentro do `FileCard`,
  que é `memo`.

Dois testes em `queue-store.test.ts` prendem exatamente isso: um compara referências de
objeto antes e depois de um progresso, o outro exige que `stats` seja o **mesmo objeto**
depois de um evento de 40%.

### O vazamento de camada que o build revelou

Medindo o bundle depois de ligar a UI: **13,1 KB de motor de imagem — estratégia,
decode, cache de escala — estavam no chunk inicial da thread principal**, código que só
roda dentro do worker. A causa era uma linha: o orquestrador chamava
`createDefaultRegistry()` para responder "este arquivo é suportado?", e o registro
instancia o `ImageEngine`.

Corrigido invertendo a dependência: a **política de aceitação** entra por injeção
(`accept: (file) => string | null`), e a implementação de imagem mora em
`engine/image/support.ts`, que é puro e importa só `format.ts`. Quem não injeta nada
aceita tudo e deixa a decisão para o worker — a mensagem é a mesma, só chega como card
com erro em vez de recusa na entrada.

| Antes                  | Depois                                |
| ---------------------- | ------------------------------------- |
| 7 scripts · 574,8 KB   | 6 scripts · 561,7 KB                  |
| motor no chunk inicial | motor só no chunk do worker (16,2 KB) |

Não é só o tamanho de hoje: na Fase 2 a mesma linha arrastaria o motor de PDF junto.

### Decisões de UI que valem discussão

1. **O dropzone é um `<button>`, não uma `div` com `onClick`.** Ganha Enter, Espaço,
   foco e papel de botão sem nenhuma linha de ARIA. É a forma mais confiável de cumprir
   "totalmente operável por teclado" do brief §7.
2. **Modo, meta e formato são `radiogroup`, não abas.** Aba troca o painel visível; isto
   escolhe um valor de formulário. Com setas do teclado e foco acompanhando a seleção.
3. **A qualidade é um `<input type="range">` de verdade**, estilizado — não uma
   reconstrução com divs. Range nativo já traz teclado completo, anúncio de valor e
   toque; refazer à mão é como se perde acessibilidade sem perceber.
4. **O tema é lido com `useSyncExternalStore`**, não com `useEffect` + `setState`. A
   fonte da verdade é o atributo que o `ThemeScript` já resolveu antes da primeira
   pintura; o `getServerSnapshot` devolve `null`, então a pré-renderização sai com
   rótulo neutro e a hidratação não diverge. (O lint do React Compiler recusa
   `setState` em efeito — e está certo.)
5. **As preferências travam enquanto o lote roda.** O orquestrador recebe as opções uma
   vez, no `run`; deixar o slider vivo produziria cards com qualidades diferentes sem
   explicação.
6. **Os padrões são os do app Electron** — auto · 5 MB · inteligente · qualidade 82,
   faixa 35–95, meta personalizada 0,1–500 MB. Fidelidade é requisito.
7. **Arrastar pasta preserva a estrutura.** `FileSystemFileEntry.file()` devolve um
   `File` com `webkitRelativePath` **vazio**, então `lib/files.ts` define a propriedade
   na mão — é o que mantém o motor com um contrato só. Com teto de profundidade e de
   itens, porque uma pasta com link circular não pode travar a aba.

### O que foi verificado, e o que não

- **`npm run build`**: exportação estática, 6 scripts iniciais, **zero código de codec**
  no bundle inicial, 14 `.wasm` como assets separados, o dropzone presente no HTML
  pré-renderizado.
- **`next dev` (Turbopack) com o worker no grafo**: compila e serve a home com dropzone,
  preferências, selo e slider. Fecha o risco que o §7 tinha deixado aberto.
- **269 testes**, 34 novos: 18 da store (com o orquestrador real e o pool falso), 10 da
  varredura de pastas e 6 do dropzone em jsdom.
- **Não verificado:** comprimir um arquivo de verdade dentro de um navegador. Nada aqui
  prova que o worker roda o codec no Chrome — é o E2E do Incremento 7, e é o único jeito
  honesto de dizer "funciona". Até lá, o teste é abrir o `npm run dev` e arrastar uma
  foto.

---

## 9. O Incremento 6 — a saída

Comprimir sem poder levar o resultado embora não é produto. Três caminhos, todos
sem servidor:

| Caminho            | Onde                           | O que preserva                      |
| ------------------ | ------------------------------ | ----------------------------------- |
| Baixar um arquivo  | botão no `FileCard`            | o nome de saída, sem a subpasta     |
| Baixar tudo (.zip) | `ActionBar` → worker de ZIP    | a árvore inteira, dentro do arquivo |
| Salvar em pasta    | `ActionBar`, onde a API existe | a árvore inteira, no disco          |

### O ZIP não comprime — e isso é a decisão, não um esquecimento

Tudo que entra no ZIP já saiu de um encoder: JPEG, WebP, AVIF e PNG são fluxos
comprimidos. Passar deflate por cima gasta CPU proporcional ao lote para ganhar perto de
zero por cento — e num lote de 50 fotos isso é o usuário esperando de novo depois de já
ter esperado a compressão. O `ZipPassThrough` do fflate usa o método **stored**, que é
do formato ZIP, não um atalho nosso: qualquer descompactador abre.

Há um teste que **prova** a escolha em vez de descrevê-la: 4096 bytes de zeros viram um
ZIP **maior** que a entrada. Com deflate ficaria em dezenas de bytes.

### Fluxo, não mapa

A API simples do fflate (`zip(objeto, cb)`) exige todos os bytes de entrada na memória
**e** produz a saída inteira de uma vez — 2× o tamanho do lote, na thread que também
segura os resultados. Com `Zip` + `ZipPassThrough`, cada arquivo é lido, empurrado e
descartado, e os pedaços da saída viram um `Blob`, que o navegador respalda em disco
(§11, decisão 6).

E os bytes **não passam pela thread principal**: quem chama `arrayBuffer()` é o worker.
A thread principal manda `Blob` — referência, não conteúdo — e recebe um `Blob` de volta.

### Detalhes que só aparecem quando se erra

1. **Revogar a object URL na hora quebra o download** em parte dos navegadores: o clique
   programático ainda não terminou de resolver o recurso. Nunca revogar segura o `Blob`
   inteiro na memória — 50 resultados de 3 MB são 150 MB até recarregar a página. A saída
   é revogar a **anterior** ao criar a próxima, e agendar a revogação da última. Cada URL
   é revogada exatamente uma vez, e há teste para as duas metades da regra.
2. **O atributo `download` ignora diretórios.** `pasta/foto.webp` vira `foto.webp` no
   disco de qualquer forma, então passamos só o nome — prometer estrutura que o navegador
   não entrega seria mentira na interface. Quem quer a árvore usa o ZIP ou "Salvar em
   pasta".
3. **Um resultado só não vira ZIP.** Obrigar a descompactar para pegar uma foto é
   cerimônia sem ganho; o botão baixa o arquivo direto e muda de rótulo.
4. **`showDirectoryPicker` exige o gesto do usuário.** Um `await` antes dele e o navegador
   recusa por falta de ativação — por isso a ação da store chama o seletor antes de
   qualquer espera.
5. **Segmentos `..` são descartados** ao recriar a árvore. Eles não aparecem em
   `webkitRelativePath`, mas confiar nisso é como se escreve fora da pasta que o usuário
   autorizou.
6. **O worker de ZIP é sempre terminado** — no sucesso, no erro e no cancelamento. Um
   worker órfão segurando um lote de 500 MB é vazamento que ninguém vê até a aba morrer.

### Degradação sem alarde

Onde a File System Access API não existe — Firefox e Safari — o botão "Salvar em pasta"
**não aparece**. Nada de item desabilitado com "seu navegador não suporta". É a regra do
`PLANO.md` §4.2, e o download comum continua ali fazendo o trabalho.

### O que os 40 testes novos cobrem

- **`zip.test.ts`** (7) — monta um ZIP e o **descompacta com o próprio fflate**: bytes
  intactos, subpastas preservadas, método stored comprovado, progresso, cancelamento e
  falha reportada.
- **`archive.test.ts`** (8) — o plumbing com um worker de mentira: progresso, abort,
  falha, morte do worker, mensagem de outro lote, e o worker terminado em todos os
  caminhos.
- **`fs-access.test.ts`** (7) — recriação da árvore com handles falsos, `..` descartado,
  progresso e cancelamento no meio.
- **`download.test.ts`** (6, jsdom) — a regra das object URLs e o carimbo do nome do ZIP.
- **`queue-store.test.ts`** (+12) — as ações de saída: um resultado baixa direto, dois
  viram ZIP, cancelar não vira erro, falha vira mensagem, duas saídas não concorrem e
  limpar a fila cancela a que estiver em curso.

### Limite conhecido

O fflate não emite ZIP64, então um lote cujo **total** passe de 4 GB não geraria um
arquivo válido. Com imagens comprimidas isso exigiria centenas de fotos de dezenas de
megabytes cada; se a Fase 3 (vídeo) chegar, o limite precisa ser tratado — provavelmente
dividindo em vários ZIPs.

### Bundle depois do incremento

O `fflate` **não** está no bundle inicial: ele vive num chunk de 5 KB carregado só pelo
worker de ZIP (`compressify-zip`, 2,5 KB). Os 7 scripts iniciais somam 568,6 KB sem
gzip, e nenhum contém código de codec nem de compactação.

---

## 10. O Incremento 7 — a prova

Este é o incremento em que o projeto para de afirmar e passa a demonstrar. Até aqui os
309 testes rodavam em Node; nenhum deles provava que `Worker`, `createImageBitmap` e
`.wasm` funcionam juntos dentro de um navegador. Agora **60 testes E2E rodam em Chromium,
Firefox e WebKit**, contra o artefato de deploy.

### O maior risco do projeto está fechado

🔴 → 🟢. Uma imagem de verdade é comprimida, baixada e verificada nos três motores. E o
**Safari, que nunca tinha sido medido**, passou em tudo — inclusive AVIF e ZIP.

O E2E roda contra `out/` servido estaticamente, não contra o `next dev`. Dois motivos: é
o artefato que vai para a Vercel, com os mesmos chunks e os mesmos `.wasm`; e é a única
forma de o `privacy.spec.ts` afirmar algo, porque no dev existe o websocket de HMR
poluindo a inspeção de rede.

### O critério de aceite #3 virou teste

`privacy.spec.ts` faz três afirmações independentes, em ordem crescente de força:

1. Nenhuma requisição sai da origem do site.
2. Nenhuma requisição tem corpo — não existe POST, PUT ou PATCH.
3. **Nenhum corpo nem URL contém o marcador que está dentro do arquivo de teste.** É a
   que pega o caso esperto: um upload disfarçado de GET com os bytes na query também
   falharia.

Mais uma quarta, estrutural: um POST em `/api/upload` não encontra nada, porque não
existe function no deploy.

As fixturas são PNGs montados à mão em `tests/e2e/fixtures.ts` — assinatura, IHDR, um
`tEXt` com o marcador, IDAT via `zlib`. Sem binário no repositório, com ruído de
fotografia (uma imagem lisa comprimiria a nada e passaria sem exercitar o motor) e com o
marcador **dentro dos bytes**, que é o que torna a afirmação de privacidade verificável.

### Lighthouse: o que a primeira medição estava medindo

| Momento                          | Performance | Acessibilidade | Boas práticas | SEO     |
| -------------------------------- | ----------- | -------------- | ------------- | ------- |
| Primeira medição                 | 80          | 100            | 96            | 100     |
| Depois de corrigir **o harness** | **98**      | **100**        | **100**       | **100** |

A diferença não foi otimização de página: a maior "oportunidade" apontada eram **378 KB
de compressão de texto** que o meu servidor de teste não fazia e a Vercel faz. Medir sem
gzip reprovava o harness, não o produto. O `scripts/serve-out.mjs` passou a comprimir, e
o número virou representativo.

Os 4 pontos de boas práticas eram um 404 de `favicon.ico` — resolvido com `app/icon.svg`,
que também era item do Incremento 8 e veio junto porque estava sujando a medição.

`/comprimir-imagem/` marca 95 · 100 · 100. A diferença para a home é a página ser mais
longa, não mais pesada.

### O que os testes E2E cobrem

- **`queue.spec.ts`** (7) — lote com ganho por arquivo, progresso individual com a aba
  respondendo (`requestAnimationFrame` em menos de 2 s enquanto os workers trabalham),
  cancelamento no meio, ZIP com assinatura `PK` verificada, download individual
  com o nome de saída, recusa de TIFF com motivo, e conversão para AVIF.
- **`privacy.spec.ts`** (2) — acima.
- **`a11y.spec.ts`** (11) — título, `h1` único e marcos em cada rota; o conteúdo presente
  **com JavaScript desligado**; o pulo para a ferramenta; a fila inteira operada só com
  teclado (setas trocam formato, setas movem a qualidade, Enter comprime); nome acessível
  em todo botão; `aria-valuenow` na barra de progresso; o tema sobrevivendo ao
  recarregamento; e a imagem de Open Graph respondendo como PNG.

### Duas diferenças de navegador que valem registro

1. **O WebKit não põe links na ordem de Tab** a menos que "Acesso total pelo teclado"
   esteja ligado no sistema. É configuração do usuário, não do documento — o teste
   verifica a posição onde isso vale e, em todo lugar, o que depende de nós: o link
   recebe foco, aparece ao focar e leva à ferramenta.
2. **`blob:` não é rede.** O WebKit registra o carregamento do worker e o download por
   esse esquema. Uma URL de blob resolve contra o armazenamento em memória do próprio
   navegador — não existe socket. Contá-la como "requisição externa" seria confundir o
   mecanismo com um vazamento; o teste isola os esquemas locais e mantém todo http(s)
   sob a régua.

### SEO, sem script de terceiros

Três landings (`/comprimir-imagem`, `/converter-webp`, `/converter-avif`), cada uma com
`metadata` própria, canônica, Open Graph, FAQ visível e o mesmo FAQ em JSON-LD — dado
estruturado que não corresponde ao conteúdo é penalizado, e com razão. Mais `sitemap.xml`
e `robots.txt` gerados na build, e a imagem de compartilhamento gerada por `ImageResponse`
**no momento do build**, sem function no deploy.

O corpo das quatro páginas é um componente só (`ToolPage`): quatro cópias do layout seria
convidar as quatro a divergirem.

### Uma armadilha do artefato

As rotas de metadata do Next saem **sem extensão** na exportação estática
(`out/opengraph-image`). Um host que decide o `Content-Type` pelo sufixo entrega
`application/octet-stream`, e o cartão de compartilhamento não renderiza em lugar nenhum —
erro que só aparece quando alguém compartilha o link. O servidor de teste passou a
farejar os bytes mágicos, e há um teste E2E que falha se a imagem deixar de responder
como PNG. **Ao trocar de host, confirmar esse cabeçalho.**

---

## 11. O Incremento 8 — a documentação

Último incremento, e o único sem código de produto. Quatro entregas:

- **`README.md`** — não existia (o do app Electron saiu no Incremento 1). O novo abre com
  a afirmação central, mostra a **captura da tela real** nos dois temas, e traz só números
  medidos: Lighthouse, 175 KB de JavaScript inicial com gzip, 11,4 MB → 1,6 MB num lote de
  três PNGs, 309 + 60 testes.
- **`docs/ARQUITETURA.md`** — as camadas e, principalmente, **por que cada fronteira está
  onde está**. A tese do documento é que toda a separação existe por um motivo só: quase
  nada disso seria testável se as camadas não tivessem sido separadas na mão.
- **`docs/ROADMAP.md`** — Fase 2 (PDF) e Fase 3 (vídeo/áudio) a partir do que **já está
  preparado**, mais o que deliberadamente não entra e por quê.
- **`scripts/screenshot.mjs`** e os ícones (`icon.svg`, `apple-icon.svg`).

### A captura é gerada, não tirada à mão

`node scripts/screenshot.mjs` sobe o build estático, comprime três fotos de verdade com as
mesmas fixturas do E2E e fotografa as duas variantes de tema. Existe como script
versionado porque captura de tela envelhece: quando a interface mudar, é um comando, não um
print torto.

Os números que aparecem na imagem são reais — 3,8 MB → 535 KB, −86%, em ~380 ms por
arquivo. Nada de mockup.

---

## 12. Armadilhas já encontradas — não repetir

| Armadilha                     | O que aconteceu                                                                                                                                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Turbopack + jSquash MT**    | Trava o build de produção com 0% de CPU. Resolvido com `--webpack` — §4                                                                                                                                                                            |
| **Raiz do workspace**         | O Turbopack inferia `C:\Users\user` por causa do lockfile da home. Corrigido com `turbopack.root`                                                                                                                                                  |
| **`next dev` e `next build`** | Rodar os dois ao mesmo tempo no mesmo `.next` trava o build sem mensagem. Se o build "não sai do lugar", conferir se há dev server aberto                                                                                                          |
| **jSquash em Node**           | Subcaminhos precisam de extensão (`/encode.js`) porque os pacotes não têm `exports`; e o `fetch` não atende `file://`, então é preciso `init(bytes)`. Nada disso vale sob Vite/vitest ou no navegador                                              |
| **`quantize` muta in-place**  | O `ImageData` da escala é reaproveitado entre tentativas; o `codecs.ts` copia antes de quantizar. Remover a cópia corrompe a busca binária silenciosamente                                                                                         |
| **TypeScript 7**              | É o `latest` do npm, mas `typescript-eslint` declara peer `<6.1.0`. **Usar 6.0.3.**                                                                                                                                                                |
| **ESLint 10**                 | `eslint-config-next@16` embute `eslint-plugin-react@7.37.5`, cujo peer vai só até `^9.7`. Quebra em runtime. **Usar 9.39.5.**                                                                                                                      |
| **lucide-react 1.x**          | Removeu os aliases depreciados. `Loader2`→`LoaderCircle`, `CheckCircle2`→`CircleCheckBig`, `AlertTriangle`→`TriangleAlert`, `XCircle`→`CircleX`, `ImageIcon`→`Image`.                                                                              |
| **`next.config.ts`**          | O Next 16 removeu a chave `eslint`. Usá-la quebra o typecheck.                                                                                                                                                                                     |
| **npm global**                | Aponta para um registry privado nesta máquina. Já resolvido pelo `.npmrc` do projeto.                                                                                                                                                              |
| **Medição sem warmup**        | A primeira rodada do spike deu 12MP "mais lento" que 24MP. Sempre descartar a primeira execução.                                                                                                                                                   |
| **Benchmark do quantizador**  | Pedir 256 cores numa imagem com menos de 256 baldes ocupados cai no atalho e **não mede** o caminho real. Medir com 64.                                                                                                                            |
| **Aviso de chunk circular**   | Qualquer `new Worker(new URL(…))` faz o webpack avisar `Circular dependency between chunks with runtime`. Reproduzi com um worker sem **nenhum** módulo compartilhado: é do bundler, não do nosso grafo. Só afeta hash de cache; a saída é correta |
| **`self` no worker**          | O `tsconfig` carrega `dom` **e** `webworker`, então o tipo de `self` é ambíguo — o `postMessage` de `Window` exige `targetOrigin`. O `image.worker.ts` declara a fatia que usa em vez de recorrer a `any`                                          |
| **`structuredClone` de erro** | Não preserva a subclasse: um `AbortedError` chega como `Error` genérico. Por isso o `kind` viaja explícito no `JobError` (§7)                                                                                                                      |
| **E2E antes da hidratação**   | A página funciona como HTML antes de o React assumir; uma tecla nesse intervalo mexe no `<input>` nativo e some no primeiro render controlado. Falha só no WebKit e só sob carga. Esperar o rótulo do `ThemeToggle` mudar (§18)                    |
| **`sharp` tem `export =`**    | `typeof import('sharp').default` não existe no tipo, embora o `import()` dinâmico entregue um namespace com `default` em runtime. Daí o alias `SharpFn` e a ponte em `loadSharp` (§17)                                                             |
| **Service worker em dev**     | Registrar em `next dev` faz o cache servir os chunks do Turbopack e o HMR para de funcionar. O registro é guardado por `NODE_ENV` (§20)                                                                                                            |

---

## 13. Decisões de produto que já foram fechadas com o Igor

Não reabrir sem motivo novo:

1. **PNG com perda:** quantizador próprio, não `image-q` (opção A — agora medida em
   92 ms a 12MP na implementação real).
2. **Design system é ajustável** quando reprova em acessibilidade. As três emendas
   estão implementadas e rastreadas em [`brand/DESVIOS.md`](brand/DESVIOS.md).
3. **Piso de 900px:** corrigido para o contrato documentado (o Electron deixava cair
   para ~756px).
4. **Decode híbrido:** nativo primeiro, WASM de fallback.
5. **TIFF está fora.** Não há decoder e os navegadores não decodificam (só o Safari).
   A mensagem explicativa já existe em `registry.unsupportedReason()`, pronta para a UI
   do Incremento 5 consumir.
6. **OPFS fica para a Fase 3.** `Blob` já é respaldado em disco pelos navegadores.
7. **AVIF fora da banda de ±10%** do critério de aceite #2 — melhor esforço, por causa
   do `speed: 8`.
8. **Sem telemetria, sem analytics, sem script de terceiros.** As fontes são
   auto-hospedadas pelo `next/font` justamente por isso.

---

## 14. Riscos ainda abertos

| Risco                                                                                 | Situação                                                                                        |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Nada foi comprimido dentro de um navegador de verdade                                 | 🟢 **Fechado** — 60 testes E2E em Chromium, Firefox e WebKit (§10)                              |
| Safari/WebKit nunca medido                                                            | 🟢 **Fechado** — passa em tudo, inclusive AVIF e ZIP (§10)                                      |
| Turbopack não empacota os codecs multi-thread                                         | 🟢 **Contornado** com `--webpack` — revisitar no futuro                                         |
| Quantizador próprio não atingir o custo estimado                                      | 🟢 **Fechado** — 92 ms a 12MP, melhor que a estimativa                                          |
| Turbopack com os workers (`next dev`)                                                 | 🟢 **Fechado** — compila e serve a home com o pool no grafo (§8)                                |
| Lighthouse ≥ 90                                                                       | 🟢 **Fechado** — 98 · 100 · 100 · 100 na home, 95 · 100 · 100 na landing (§10)                  |
| Orçamento de 96 MP em voo continua estimativa, não medição                            | 🟡 A aritmética está testada e o E2E não travou nenhuma aba; falta medir memória real           |
| Firefox lento pode exigir ajuste do teto de 20 s por job                              | 🟡 Nenhum job estourou o teto no E2E, mas com fixturas modestas — refazer com foto de 12MP      |
| Deploy carrega `.wasm` que nunca usamos (`avif_enc_mt` 3,4 MB, `hqx`, `magic-kernel`) | 🟡 **Avaliado e deixado como está** — ver abaixo                                                |
| ZIP acima de 4 GB no total (fflate sem ZIP64)                                         | 🟡 Irrelevante para imagens; revisitar na Fase 3 (§9)                                           |
| Cabeçalho da imagem de OG em host que não seja a Vercel                               | 🟡 Há teste E2E, mas ele mede o servidor local — conferir depois do primeiro deploy (§10)       |
| Cache-Control do `/sw.js` no host                                                     | 🟡 Um service worker com cache longo prende o app numa versão antiga — conferir no deploy (§20) |
| Navegação offline no Safari                                                           | 🟡 O harness do Playwright não consegue medir; o service worker instala e controla lá (§20)     |
| Lighthouse medido em máquina ocupada                                                  | 🟡 95 hoje, 98 antes; o service worker custa ≤ 1 ponto (medido com e sem) — refazer limpo       |

**Sobre os 3,4 MB do `avif_enc_mt`:** dá para tirá-los com uma regra de substituição de
módulo no webpack, e a economia seria 28% do deploy (12 MB no total). Não fiz, e a razão
é proporção: esses arquivos **nunca são baixados pelo usuário** — só entrariam em ação
com `crossOriginIsolated`, que exige COOP/COEP e nós não ligamos. O custo é armazenamento
no host, não banda de quem usa. Interceptar a resolução de módulos de um pacote que
acabou de ser provado ponta a ponta nos três navegadores, para economizar espaço que
ninguém paga, é risco sem retorno. **O gatilho para revisitar é a Fase 3**, quando o
`ffmpeg.wasm` exigir COOP/COEP e essas variantes deixarem de ser código morto.

---

## 15. Critérios de aceite da Fase 1 — rastreamento

Do brief original, com o estado de cada um:

- [x] 50 imagens em paralelo com progresso individual — E2E comprime lotes com progresso
      por arquivo nos três navegadores
- [x] Modo meta equivalente ao Electron (±10%, AVIF excluído) — **medido: pior caso
      +0,4%**, com dois casos idênticos ao byte. A comparação roda os dois produtos sobre
      os mesmos bytes e está em [`COMPARACAO-ELECTRON.md`](COMPARACAO-ELECTRON.md); o
      relatório é gerado pela medição (`npm run paridade`), não escrito à mão
- [x] Nenhuma requisição carregando conteúdo do usuário — `privacy.spec.ts` verifica
      origem, corpo e o marcador dentro do arquivo, nos três navegadores
- [x] A aba não trava — o E2E mede `requestAnimationFrame` durante o lote e exige
      resposta em menos de 2 s
- [x] Cancelar a fila no meio — botão na `ActionBar`, `cancelAll` com terminação de
      worker preso, e cancelamento por arquivo no card
- [x] Baixar tudo em ZIP — worker dedicado, método stored, árvore preservada; o teste
      monta e descompacta um ZIP de verdade
- [x] Chrome, Firefox e Safari — 60 testes passando nos três; as duas diferenças de
      comportamento estão documentadas no §10
- [x] Lighthouse > 90 em Performance e Acessibilidade — **98 e 100** na home; 95 e 100 na
      landing. Medido contra o build servido com gzip, como a Vercel serve
- [x] `npm run check` passa limpo — 309 testes
- [x] Modo claro e escuro completos — tokens em toda a UI, alternador na barra superior
      sem flash, e o E2E verifica que a escolha sobrevive ao recarregamento

---

## 16. Como retomar

```bash
cd Compressify
npm install                # o .npmrc já força o registry público
npm run check              # 348 testes, ~50 s (20 s são a paridade — §17)
npm run build              # exportação estática + service worker (§4, §20)
npx playwright install     # uma vez: baixa Chromium, Firefox e WebKit
npm run e2e                # 97 testes nos três motores, contra out/
npm run paridade           # reescreve COMPARACAO-ELECTRON.md a partir da medição
npm run dev                # http://localhost:3000
```

**Feche dev servers abertos deste projeto antes de rodar `npm run build`** — ver §12.

### O que fazer a seguir

A Fase 1 está fechada com os 10 critérios de aceite medidos, e sete dos oito itens do
roadmap foram feitos. O que resta, em ordem:

1. **Deploy.** É a única coisa que separa o projeto de estar no ar, e é um passo para
   fora que precisa da decisão do Igor. O `NEXT_PUBLIC_SITE_URL` aponta para
   `compressify.vercel.app`; ajustar se o domínio for outro, porque três lugares leem
   essa constante (canônica, sitemap, JSON-LD). **Duas conferências depois do primeiro
   deploy:**
   - o `Content-Type` da imagem de Open Graph, que sai sem extensão na exportação
     estática (§10);
   - o `Content-Type` de `/sw.js` e o cabeçalho de cache dele. Um service worker servido
     com cache longo demais é o que faz um PWA ficar preso numa versão antiga. A Vercel
     serve `no-cache` para `sw.js` por padrão, mas isso é da Vercel, não nosso.
2. **Refazer a medição do Lighthouse numa máquina em repouso.** Os 95 do README foram
   medidos com build e testes rodando; o número já foi 98. O service worker foi medido
   com e sem e custa no máximo 1 ponto, então a diferença é ambiente — mas o número
   publicado deveria vir de uma medição limpa.
3. **Fase 2 (PDF)** — um `engine/pdf/engine.ts` implementando `CompressionEngine` e uma
   linha no registro. A fila, o pool, o orçamento, o cancelamento, a nomenclatura e as três
   saídas funcionam sem alteração.
4. **O último item do roadmap** — enxugar os `.wasm` não usados — continua parado de
   propósito, e o gatilho para revisitá-lo é a Fase 3 (§14).

Ordem de leitura para quem chega: `README.md` → **este arquivo** → `ARQUITETURA.md` →
`PLANO.md` §3 (as decisões do motor) → `SPIKE.md` §5 (as mitigações medidas) →
`src/engine/image/strategy.ts` → `src/engine/core/pool.ts` → `tests/e2e/privacy.spec.ts`.

O comentário no topo do `strategy.ts` explica por que ele não importa nada — essa
separação é o que sustenta a testabilidade do projeto inteiro. O `engine.ts` liga os
codecs sem quebrá-la: eles entram por injeção, e é por isso que 329 dos 348 testes
rodam sem um byte de WASM. O `pool.ts` faz o mesmo uma camada acima, com a
fábrica de workers, e a `store/queue.ts` uma acima ainda. O E2E fecha por fora: o que
todas essas fronteiras permitiram testar isoladamente, ele prova junto, num navegador.

---

## 17. O Incremento 9 — a paridade virou número

A última promessa do brief sem medição. O `PLANO.md` afirmava que o algoritmo tinha sido
portado fielmente, e havia 300 testes sustentando cada peça — mas nenhum deles punha os
**dois produtos** lado a lado sobre os mesmos bytes.

`tests/helpers/electron-reference.ts` é a transcrição literal do pipeline de
`src/main/index.ts` da tag `v1.0.0-electron`, rodando com `sharp` **0.33.5** — a versão
que o `package-lock.json` daquela tag resolveu. Comparar com outra versão de libvips
compararia duas coisas ao mesmo tempo.

A regra do arquivo é não melhorar nada: ele reproduz inclusive o piso de resolução
defeituoso, que testava a escala _atual_ antes de multiplicar. É o defeito que faz a
comparação valer.

### O resultado

| Regime                            | Pior caso                     |
| --------------------------------- | ----------------------------- |
| Meta alcançável sem redimensionar | **+0,4%** (dois casos a 0,0%) |
| Meta que exige downscale          | +78%, e não é regressão       |

Os dois casos a **0,0%** fazem sentido: os dois lados codificam JPEG com mozjpeg na mesma
qualidade, um nativo e outro em WASM. Byte a byte.

O caso de +78% é o piso de 900px (`PLANO.md` §3.3): o desktop entrega um arquivo menor
porque entrega **uma imagem menor**, 1128×846 contra os nossos 1344×1008. Comparar bytes
ali seria comparar duas decisões de produto. O relatório mostra o caso com o número em
vez de escondê-lo, e o teste continua exigindo o que é do algoritmo — que o piso valha, e
que nenhum dos dois entregue acima da meta em silêncio.

### Duas decisões

1. **A comparação roda no `npm run check`**, e custa ~20 s. Uma verificação que só roda
   quando alguém lembra para de valer no dia em que alguém mexe na estratégia. Sem o
   `sharp` instalado (é `devDependency`), a suíte é **pulada, não quebrada**.
2. **O relatório é gerado pela medição** (`npm run paridade`), pelo mesmo motivo que a
   captura do README é um script: número copiado à mão envelhece sem avisar.

---

## 18. O Incremento 10 — perfis e preferências que ficam

Dois itens do roadmap que são o mesmo problema visto de dois lados: quase ninguém sabe o
que significa qualidade 82, e quem descobriu não quer redescobrir a cada visita.

**O perfil aceso é derivado das opções.** Não existe campo `profile` no estado, então não
existe a falha clássica de o rótulo dizer "Web" enquanto o slider está em 40. Mexer num
controle cai em "Personalizado" sozinho; voltar a bater reacende o perfil.

Cuidado de vocabulário que vale para quem for mexer: `JobOptions.preset` já significa
**meta de tamanho**, herdado do Electron. Por isso _perfis_, não _presets_.

**Nada que venha do `localStorage` é confiado.** A validação é campo a campo — um spread
sobre o padrão aceitaria `quality: "muita"` e mandaria a string para o motor. Vocabulário
desconhecido cai no padrão; número fora de faixa é clampado, porque "0" é intenção
legível e "turbo" não é.

**Só configuração é guardada, nunca nada sobre os arquivos.** Há um teste de unidade e um
E2E prendendo exatamente isso: se alguém acrescentar "últimos arquivos" ali um dia, os
dois quebram e a decisão precisa ser consciente.

### A hidratação roda depois da montagem, e é de propósito

A página é pré-renderizada na build, onde `localStorage` não existe. Ler a preferência
durante a **primeira** renderização do cliente faria o React encontrar um HTML diferente
do que acabou de gerar — o painel diria "meta · 10 MB" onde o documento diz "auto · 5 MB".
O preço é um quadro com os padrões, o mesmo que o `ThemeToggle` já paga pelo rótulo
neutro. **Não "otimize" isso**: o `preferencias.spec.ts` e o teste de JavaScript desligado
quebram juntos.

`DEFAULT_OPTIONS` e as faixas saíram para `lib/defaults.ts`, que é folha:
`lib/preferences.ts` precisa validar um valor sem puxar a store, e a store puxa o
orquestrador, que puxa o pool.

### Uma armadilha de E2E que vale para os próximos

O primeiro teste falhou **só no WebKit e só sob carga**. A causa não era o WebKit: é a
página funcionar como HTML antes de o React assumir. Uma seta pressionada nesse intervalo
mexe no `<input>` nativo, não chega na store e some no primeiro render controlado.

A solução foi esperar um sinal de hidratação **que já é do produto**: o rótulo do
`ThemeToggle` deixa de ser o neutro "Alternar tema". Qualquer teste novo que dispare
teclado logo depois de um `goto` precisa da mesma espera.

---

## 19. O Incremento 11 — antes/depois e o título da aba

"Perdeu qualidade?" é a pergunta que todo mundo faz, e o produto vinha respondendo com
bytes, que é a resposta para outra pergunta.

**A divisória é um `<input type="range">`** transparente por cima das imagens, não uma
`div` com `onPointerMove`. Range nativo já traz setas, Home/End, PageUp/PageDown, toque e
anúncio de valor — a mesma escolha que o slider de qualidade fez. O teste de teclado passa
sem uma linha de código de teclado no componente.

**A modal é um `<dialog>` nativo** com `showModal()`: armadilha de foco, `Esc`, inerte no
resto da página e backdrop. Há E2E medindo o `Esc` nos três navegadores, porque "de graça"
é uma afirmação sobre o navegador.

**As duas object URLs nascem e morrem com a modal.** Cinquenta cards com a modal sempre
montada seriam cem URLs segurando o lote na memória. O item passou a guardar o `File` de
entrada, e isso não custa memória: um `File` é uma referência ao que o navegador já tem em
disco, e o orquestrador já segura a mesma.

**Nenhuma das imagens é `aria-hidden`.** A primeira versão escondia a de cima, e o teste
não a encontrou — o que estava certo em recusar: as duas são conteúdo.

### O título da aba mostra contagem, não porcentagem

E a razão é arquitetural. Porcentagem real exigiria a média do progresso de todos os
itens, ou seja, assinar `items` inteiro — exatamente o que a store foi desenhada para
evitar (§8). A árvore repintaria dezenas de vezes por segundo para animar um texto que
está fora da tela. `stats` já é estado, e "12 de 50" responde melhor que "37%".

O título é restaurado no fim do lote **e no desmonte**: uma aba marcada com um lote que já
acabou é pior que uma aba sem contador.

---

## 20. O Incremento 12 — sem rede, e sem metadados

### O PWA

O item mais alinhado com a tese do produto: um compressor que roda inteiro no cliente não
tem motivo nenhum para exigir conexão depois do primeiro carregamento.

**O service worker é gerado** por `scripts/gerar-sw.mjs`, dentro do `npm run build`. Não
dava para escrevê-lo à mão: os chunks têm hash no nome, e uma lista de precache manual
apontaria para o build anterior — o modo clássico de um PWA servir uma versão fantasma
para sempre. A versão do cache é o hash da lista, então muda exatamente quando o conteúdo
muda.

**O casco é o que os documentos referenciam**, extraído do próprio HTML — a mesma técnica
que o Incremento 3 usou para provar que nenhum codec vazava para o bundle inicial. A
diferença é o ponto:

| Critério                      | Tamanho    |
| ----------------------------- | ---------- |
| Varrer o `out/` inteiro       | 1,7 MB     |
| Só o que o HTML referencia    | **832 KB** |
| Os `.wasm` (fora do precache) | 9,7 MB     |

Os codecs entram no cache **quando são usados**. Precacheá-los cobraria de quem só abriu a
página o custo de todos os formatos, desfazendo o carregamento sob demanda.

**Navegação é rede primeiro; o resto é cache primeiro.** O contrário prenderia a pessoa
numa versão antiga até o worker trocar, e este é um app que ganha capacidade a cada
deploy. Os assets com hash são imutáveis por construção, então cache primeiro neles é
correto por definição.

Sem `workbox` e sem `next-pwa`: dezenas de KB e uma dependência viva para substituir 60
linhas. A regra de não carregar código de terceiros vale aqui como vale no HTML.

**O registro só acontece em produção.** Em `next dev` o service worker interceptaria os
chunks do Turbopack e o HMR passaria a servir cache — o bug mais confuso que existe.

### Uma limitação de harness, registrada

`context.setOffline(true)` seguido de `reload()` derruba o driver do WebKit com "WebKit
encountered an internal error", **antes** de a navegação chegar ao service worker. Os dois
testes que dependem disso são pulados lá, com a razão no arquivo. No mesmo WebKit o
service worker instala, precacheia e assume o controle — isso está medido. O que fica sem
medição no Safari é a navegação sem rede.

### O EXIF não precisava de uma opção

O roadmap pedia "remover metadados **opcionalmente**". Ao implementar, a conclusão foi que
a caixinha não deveria existir: o pipeline decodifica para pixels e recodifica do zero,
então EXIF, IPTC, XMP e ICC **nunca** atravessaram. Não havia o que ligar; havia o que
provar.

`tests/integration/metadata.test.ts` monta um JPEG com um bloco EXIF de verdade —
assinatura, TIFF, tag `ImageDescription` — contendo um marcador, e verifica que ele não
está na saída em `jpeg`, `webp` nem `png`. É o mesmo truque do `privacy.spec.ts`: o
marcador dentro dos bytes é o que torna a afirmação verificável.

A **orientação** é a exceção deliberada: ela não é preservada como metadado, é **aplicada
aos pixels** (§3.2 do decode). A foto de celular em pé sai em pé, sem levar junto a
coordenada de onde foi tirada.
