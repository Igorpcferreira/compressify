# Handoff — estado do projeto e o que vem a seguir

> Documento de continuidade. Quem retomar o Compressify (pessoa ou sessão nova de
> IA) deve ler **este arquivo primeiro** e só então mergulhar no `PLANO.md`.
>
> Última atualização: 26/07/2026, ao fim do **Incremento 4**. O motor comprime
> arquivos reais de ponta a ponta, agora dentro de workers, com fila, orçamento
> de memória e cancelamento. A troca de bundler do Incremento 3 continua
> esperando o seu aval (§4).
>
> **Dois blocos de trabalho estão na árvore sem commit** — os Incrementos 3 e 4.
> As duas mensagens sugeridas estão em §12.

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
   pode estar defasada. Isso já pegou três armadilhas reais (§8).
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
         ⬅️ os Incrementos 3 e 4 estão na árvore, **sem commit**, aguardando validação
```

| Incremento                                   | Estado                                |
| -------------------------------------------- | ------------------------------------- |
| 0 — Spike do motor                           | ✅ concluído · [`SPIKE.md`](SPIKE.md) |
| 1 — Fundação                                 | ✅ concluído                          |
| 2 — Algoritmo puro + testes                  | ✅ concluído                          |
| 3 — Motor de imagem real                     | ✅ concluído · 168 testes             |
| **4 — Worker, pool, cancelamento**           | ✅ **concluído · 235 testes**         |
| **5 — Store, fila e UI**                     | ⬅️ **próximo**                        |
| 6 — Saída: download, ZIP, File System Access | pendente                              |
| 7 — Acabamento: SEO, modo escuro, a11y, E2E  | pendente                              |
| 8 — Documentação e ícones                    | pendente                              |

`npm run check` (typecheck + lint + formatação + 235 testes) passa limpo em ~10 s.
`npm run build` gera exportação estática sem nenhuma serverless function — **agora com
webpack, não Turbopack**. O porquê está na §4.

### O que já existe em código

```
app/
  layout.tsx          fontes via next/font (auto-hospedadas), metadata, ThemeScript
  page.tsx            PLACEHOLDER do Incremento 1 — será substituído no 5
  globals.css         design system inteiro em @theme + camada semântica de tema
src/
  components/theme/ThemeScript.tsx     resolve o tema antes da primeira pintura
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
  engine/image/strategy.ts             ★ o algoritmo portado — núcleo do projeto
  engine/image/quantize.ts             ★ quantizador próprio (median cut + LUT)
  engine/image/probe.ts                ★ lê cabeçalho (formato, dimensões, bits)
  engine/image/decode.ts               ★ decode híbrido nativo/WASM
  engine/image/codecs.ts               ★ encode e resize, carregados sob demanda
  engine/image/engine.ts               ★ ImageEngine: supports/probe/process
  engine/image/format.ts               smart/original → formato concreto
  engine/image/naming.ts               sufixo -compressify, colisões, caminho relativo
  lib/format.ts                        formatBytes/formatPercent em pt-BR
tests/
  helpers/images.ts                    construtores de cabeçalho, File e foto sintética
  helpers/codecs-node.ts               inicializa os codecs reais em Node
  helpers/workers.ts                   ◆ workers de mentira, dirigidos pelo teste
  unit/                                229 testes — lógica, com codecs injetados
  integration/engine-codecs.test.ts    6 testes — o motor com os codecs de verdade
docs/                                  PLANO, SPIKE, HANDOFF, brand/
```

`★` é o Incremento 3, `◆` é o Incremento 4.

Dependências do Incremento 3, todas conferidas contra o `latest` do npm em 25/07/2026
(as seis coincidiram com o que o plano previa):

```
@jsquash/jpeg 1.6.0 · @jsquash/png 3.1.1 · @jsquash/webp 1.5.0
@jsquash/avif 2.1.1 · @jsquash/resize 2.1.1 · @jsquash/oxipng 2.3.0
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
Vale checar no Incremento 5, quando a UI passar a montar o pool de verdade.

---

## 8. Armadilhas já encontradas — não repetir

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

---

## 9. Decisões de produto que já foram fechadas com o Igor

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

## 10. Riscos ainda abertos

| Risco                                                                                    | Situação                                                                     |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Turbopack não empacota os codecs multi-thread                                            | 🟢 **Contornado** com `--webpack` — revisitar no futuro                      |
| Quantizador próprio não atingir o custo estimado                                         | 🟢 **Fechado** — 92 ms a 12MP, melhor que a estimativa                       |
| Turbopack com o worker (`next dev`)                                                      | 🟡 **Novo** — o build de produção foi verificado; o `dev` só no Incremento 5 |
| Decode nativo e contexto de worker sem verificação real                                  | 🟡 Incrementos 5 e 7 — a fila existe, mas nada rodou em navegador ainda      |
| Safari/WebKit nunca medido                                                               | 🟡 Incremento 7                                                              |
| Orçamento de 96 MP em voo continua estimativa, não medição                               | 🟡 Incremento 5 — a aritmética está testada; falta memória real de navegador |
| Firefox lento pode exigir ajuste do teto de 20 s por job                                 | 🟡 Incremento 5                                                              |
| Deploy carrega `.wasm` que nunca usamos (`avif_enc_mt` de 3,4 MB, `hqx`, `magic-kernel`) | 🟡 Incremento 7 — não afetam o carregamento inicial, só o tamanho do deploy  |

---

## 11. Critérios de aceite da Fase 1 — rastreamento

Do brief original, com o estado de cada um:

- [ ] 50 imagens em paralelo com progresso individual — pool e fila prontos e testados;
      falta a UI, no Incremento 5
- [ ] Modo meta equivalente ao Electron (±10%, AVIF excluído) — motor pronto e verificado;
      falta a comparação com as fixtures do app Electron, no Incremento 7
- [ ] Nenhuma requisição carregando conteúdo do usuário — `privacy.spec.ts`, Incremento 7
- [ ] A aba não trava — pixels só em worker, inclusive o `probe`; verificar no 5
- [ ] Cancelar a fila no meio — **implementado e testado** (`cancelAll`, com terminação
      de worker preso); falta o botão, no Incremento 5
- [ ] Baixar tudo em ZIP — Incremento 6
- [ ] Chrome, Firefox e Safari com degradação documentada — Incremento 7
- [ ] Lighthouse > 90 em Performance e Acessibilidade — Incremento 7; os codecs continuam
      fora do bundle inicial mesmo com o worker no grafo (§7)
- [x] `npm run check` passa limpo — 235 testes
- [ ] Modo claro e escuro completos — tokens prontos, aplicação nos Incrementos 5 e 7

---

## 12. Como retomar

```bash
cd Compressify
npm install          # o .npmrc já força o registry público
npm run check        # deve passar limpo — 235 testes, ~10 s
npm run dev          # http://localhost:3000
npm run build        # exportação estática, via webpack (§4)
```

**Feche dev servers abertos deste projeto antes de rodar `npm run build`** — ver §8.

### O Incremento 5, em uma frase cada

- `src/store/queue.ts` — a store Zustand, alimentada pelos eventos do
  `QueueOrchestrator` (`onAccepted`, `onMetadata`, `onStart`, `onProgress`, `onSettled`,
  `onIdle`). Normalizada por `id`, com seletores estáveis: cada `FileCard` assina o seu.
- `src/components/queue/Dropzone.tsx` — arrastar, colar e escolher pasta, com teclado.
  Os recusados já chegam prontos, com motivo, em `add().rejected`.
- `FileCard` · `QueueList` · `ActionBar` — progresso individual, cancelar um, cancelar
  todos, e o aviso de "esta imagem sozinha excede o orçamento de memória"
  (`MegapixelBudget.exceedsTotal`).
- A raiz de composição: `createImagePool()` de `engine/workers/spawn.ts` dentro de um
  `useEffect`, com `dispose()` na limpeza. **Conferir o `next dev` com o worker** — o
  Turbopack ainda não viu esse grafo (§10).

O `zustand` ainda não está instalado. Conferir a versão contra o `latest` do npm antes
de fixar — regra §1.4, que já pegou três armadilhas.

### As duas mensagens de commit sugeridas

Os Incrementos 3 e 4 estão na árvore, sem commit. São dois blocos independentes e
merecem dois commits, nesta ordem.

**1 — Incremento 3** (`src/engine/image/*`, `src/engine/core/{types,registry}.ts`,
`tests/unit/{engine,probe,registry}.test.ts`, `tests/integration/`, `next.config.ts`,
`package.json`):

```
feat(engine): motor de imagem real, com codecs verificados de ponta a ponta

ImageEngine implementando CompressionEngine: leitura de cabeçalho sem
decodificar, decode híbrido (nativo primeiro, jSquash de fallback), encode por
formato com carregamento sob demanda, cache de escala de um slot, guarda de
tempo de 20 s e progresso monotônico. Registro de motores resolvendo por
arquivo.

Os pontos de operação são os medidos no Incremento 0: AVIF speed 8, oxipng
nível 1, WebP sem target_size. O quantizador próprio faz 12MP em 92 ms, o que
fecha o risco aberto no PLANO.md §11.

60 testes novos (168 no total): 54 de unidade com codecs injetados e 6 de
integração com os codecs reais, provando que um JPEG vira um WebP válido e que
o PNG com perda cai para a paleta prescrita.

O build de produção passa a usar webpack: o Turbopack trava indefinidamente ao
empacotar os pacotes jSquash com variante multi-thread (oxipng pkg-parallel e
avif_enc_mt). Diagnóstico completo em docs/HANDOFF.md §4.
```

**2 — Incremento 4** (`src/engine/core/{budget,naming,pool,orchestrator}.ts`,
`src/engine/workers/`, `src/engine/image/naming.ts`, `tests/helpers/workers.ts`,
`tests/unit/{budget,core-naming,pool,runner,orchestrator}.test.ts`):

```
feat(engine): concorrência — worker, pool com orçamento de memória e fila

O motor passa a rodar fora da thread principal. Worker de imagem com o
runner separado da ligação com `self`, pool dimensionado por núcleos e por
megapixels em voo, e orquestrador com a fila que a UI vai consumir por
eventos.

Cancelamento de verdade: o worker checa o signal entre tentativas e, se não
responder ao abort em 2 s — preso num encode, que não é interrompível —, é
terminado e substituído. Falha de execução ganha uma retentativa com worker
novo, que é a mitigação do PLANO.md §2.2 para o avif que quebrou uma vez no
Firefox.

O `probe` também roda no worker: ele decodifica quando o cabeçalho é
ilegível, e decodificar 24MP na thread principal é a aba travada. A reserva
final do nome de saída é global, na thread principal, porque o Set de cada
worker só enxerga os jobs daquele worker.

67 testes novos (235 no total), todos em Node: o pool recebe uma fábrica de
workers de mentira e o orquestrador recebe um pool de mentira.

O build de produção foi verificado com o worker ligado: o chunk é emitido, os
14 .wasm continuam separados e nenhum script do HTML inicial contém código de
codec. Detalhes em docs/HANDOFF.md §7.
```

Ordem de leitura para quem chega: este arquivo → `PLANO.md` §3 (as decisões do motor)
→ `SPIKE.md` §5 (as mitigações medidas) → `src/engine/image/strategy.ts` →
`src/engine/image/engine.ts` → `src/engine/core/pool.ts`.

O comentário no topo do `strategy.ts` explica por que ele não importa nada — essa
separação é o que sustenta a testabilidade do projeto inteiro. O `engine.ts` liga os
codecs sem quebrá-la: eles entram por injeção, e é por isso que 229 dos 235 testes rodam
sem um byte de WASM. O `pool.ts` faz o mesmo uma camada acima, com a fábrica de workers —
é o motivo de a concorrência inteira ser testável sem abrir um navegador.
