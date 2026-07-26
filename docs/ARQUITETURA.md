# Arquitetura

> Como o Compressify está montado e **por que cada fronteira está onde está**. O
> `PLANO.md` registra as decisões no momento em que foram tomadas; este arquivo
> descreve o que existe hoje, depois de sete incrementos.

---

## 1. A ideia central

Um compressor de imagens no navegador tem um problema óbvio e um problema real.

O óbvio: codecs em WebAssembly são pesados e lentos, e se rodarem na thread principal a
aba congela. Resolve-se com workers.

O real: **quase nada disso é testável se as camadas não forem separadas na mão**. Um
codec WASM não roda em jsdom. Um `Worker` não existe em Node. Um `OffscreenCanvas` não
existe fora do navegador. Escrito do jeito natural — o motor importando os codecs, o pool
instanciando `Worker`, a store chamando o pool — o projeto inteiro só seria verificável
com um navegador aberto, o que na prática significa não ser verificado.

Toda a arquitetura abaixo é consequência de recusar isso.

---

## 2. As camadas

```
                              thread principal
┌──────────────────────────────────────────────────────────────────────┐
│  Dropzone ─► queueStore (Zustand) ◄─ FileCard × N                    │
│                   │         ▲                                        │
│                   ▼         │ eventos                                │
│            QueueOrchestrator                                         │
│              │         │                                             │
│              │         └──► lib/archive ──► zip.worker  (fflate)     │
│              ▼                                                       │
│          WorkerPool ─── orçamento de megapixels (core/budget)        │
└──────────────┬───────────────────────────────────────────────────────┘
               │ postMessage · Blob por referência
        ┌──────┴──────┬─────────────┬─────────────┐
        ▼             ▼             ▼             ▼
    image.worker  image.worker  image.worker  … (núcleos − 1, máx. 8)
        │
        │  runner ─► registry ─► ImageEngine
        │                          │
        │                          ├─ probe.ts     cabeçalho, sem decodificar
        │                          ├─ decode.ts    nativo primeiro, WASM de fallback
        │                          ├─ strategy.ts  ◄── código puro, sem WASM
        │                          ├─ codecs.ts    encode/resize sob demanda
        │                          └─ quantize.ts  median cut + LUT
        ▼
   JobResult { blob, outputName, bytes, savedPercent, status }
```

### 2.1 Estratégia — `engine/image/strategy.ts`

O ativo intelectual do projeto: a escada de qualidade do modo automático e a busca binária
com downscale do modo meta. Porte fiel do app Electron.

**Não importa nada.** Nem WASM, nem canvas, nem DOM. Recebe uma função
`render(attempt) => Promise<Uint8Array>` e não sabe o que há do outro lado — nos testes é
um modelo de tamanho sintético, em produção são os codecs.

É o que torna realizável o requisito de "casos de borda testados": arquivo já menor que a
meta, meta impossível, imagem menor que 900 px, meta igual ao original, qualidade pedida
coincidindo com um degrau. Todos verificáveis sem carregar 3,4 MB de WebAssembly.

### 2.2 Motor — `engine/image/engine.ts`

Implementa `CompressionEngine`: `supports`, `probe`, `process`. Coordena — decodifica uma
vez, mantém o cache de escala, conta progresso, cuida do orçamento de tempo, monta o
resultado — e não decide **como** comprimir (é da estratégia) nem **como** codificar (é do
`codecs.ts`).

Os codecs entram por injeção (`ImageCodecs`). Não é cerimônia: é o que permite exercitar o
motor inteiro em Node, sem WASM e sem canvas, no mesmo caminho que o usuário percorre.

Três detalhes que parecem arbitrários e não são:

- **Cache de escala de um slot só.** A busca percorre as escalas em ordem decrescente e
  nunca volta; um slot entrega o mesmo ganho (8 resizes no pior caso, não 56) e libera a
  escala morta na hora. Com oito workers segurando `ImageData` de 12 MP a ~48 MB cada,
  isso é a diferença entre caber e a aba morrer.
- **Decode único por job.** O app desktop re-decodificava até 56 vezes no modo meta.
- **Progresso monotônico, travado em 95%.** Progresso que retrocede lê como bug mesmo
  quando é honesto.

### 2.3 Registro — `engine/core/registry.ts`

A fila nunca menciona `ImageEngine`: ela pergunta ao registro quem sabe processar um
arquivo. É o que faz a Fase 2 (PDF) entrar registrando um `PdfEngine` sem tocar em nada.

**O registro vive dentro do worker.** Isso não é detalhe de organização: instanciar o
motor na thread principal — só para responder "este arquivo é suportado?" — colocava 13 KB
de estratégia e decode no bundle inicial, medido no build. A política de aceitação foi
extraída para `engine/image/support.ts`, que é puro e importa só a resolução de formato.
Na Fase 2, a mesma linha arrastaria o motor de PDF junto.

### 2.4 Concorrência — `engine/core/{pool,budget}.ts`

Dois limites simultâneos, não um:

```
workers     = clamp(hardwareConcurrency − 1, 1, 8)
orçamentoMP = deviceMemory ? clamp(deviceMemory × 16, 48, 160) : 96
```

O segundo existe porque o primeiro não protege de nada: oito workers livres com fotos de
24 MP são ~2,4 GB de RGBA. Cada job reserva `largura × altura / 1e6` antes de entrar num
worker e libera ao sair.

A fila é **FIFO estrita**: quando o primeiro não cabe no orçamento, ninguém passa na
frente, mesmo havendo slot livre. Deixar os pequenos furarem renderia mais vazão e faria a
foto grande esperar enquanto o usuário olha um card parado. Previsibilidade ganhou de
vazão — e há um teste que trava a escolha.

Um job maior que o orçamento inteiro **roda mesmo assim, sozinho**. Recusar seria pior que
tentar.

O pool recebe uma **fábrica de workers**, não a classe `Worker`. É o que permite testar
ordem de despacho, orçamento, cancelamento com worker travado e retentativa — em Node, de
forma determinística.

### 2.5 Cancelamento

Um encode isolado não é interrompível. O worker checa o `signal` entre tentativas; se não
responder ao `abort` em 2 s — porque está dentro de um AVIF longo — é **terminado e
substituído**. É o único jeito de o cancelamento ser imediato do ponto de vista de quem
clicou.

Um detalhe que só aparece ao escrever o teste: o worker também precisa **descartar o
resultado** de um job abortado que terminou o encode mesmo assim. Sem isso, um card
cancelado volta sozinho para "concluído".

### 2.6 Fila — `engine/core/orchestrator.ts`

A única peça que vê o lote inteiro, e é por isso que três responsabilidades moram nela:
aceitar ou recusar na entrada, **garantir nomes de saída únicos** e cancelar.

A unicidade merece explicação: cada worker tem sua própria instância de motor, logo seu
próprio `Set` de nomes. Dois `foto.jpg` de pastas diferentes produzem o mesmo
`foto-compressify.webp` sem saber um do outro. A reserva final é global e acontece na
thread principal — `reserveUniquePath`, idempotente quando não há colisão.

### 2.7 Store — `store/queue.ts`

Zustand foi escolhido por um argumento de re-render: com oito workers reportando
progresso, são dezenas de eventos por segundo, e em Context + reducer cada evento repinta
todos os consumidores.

Duas regras sustentam a promessa, e quebrar qualquer uma anula o motivo de a store existir:

1. **Um evento de progresso troca a referência de um item só.** `items` é um mapa por
   `id`; o `FileCard` que assina `state.items[id]` não repinta quando o vizinho anda 1%.
2. **`stats` é estado, não seletor derivado.** Recalculado quando um job entra, sai ou
   termina — nunca a cada 1%.

Ambas estão sob teste: um compara referências de objeto antes e depois de um progresso, o
outro exige que `stats` seja o **mesmo objeto** depois de um evento de 40%.

### 2.8 Saída — `lib/{download,archive,fsAccess}.ts`

Três caminhos, nenhum passando por servidor. O ZIP é montado **num worker**, em fluxo
(`Zip` + `ZipPassThrough`), com método **stored**: tudo que entra já saiu de um encoder, e
recomprimir gastaria CPU proporcional ao lote para ganhar perto de zero.

---

## 3. As fronteiras, resumidas

| Fronteira         | O que entra por injeção                     | O que isso permite testar em Node                      |
| ----------------- | ------------------------------------------- | ------------------------------------------------------ |
| `strategy.ts`     | uma função `render`                         | escada, busca binária, todos os casos de borda         |
| `engine.ts`       | `ImageCodecs`                               | decode único, cache de escala, progresso, nomenclatura |
| `pool.ts`         | uma fábrica de workers                      | despacho, orçamento, cancelamento, retentativa         |
| `orchestrator.ts` | um `JobPool` e uma política de aceitação    | fila, recusa na entrada, nomes únicos                  |
| `store/queue.ts`  | uma fábrica de orquestrador, ZIP e gravação | a UI inteira, sem navegador                            |

Cada linha é uma decisão de design pagando por si mesma em cobertura.

---

## 4. Onde a coisa toca o navegador

Três lugares, e só três:

1. `engine/workers/spawn.ts` — `new Worker(new URL(…, import.meta.url))`. Isolado num
   módulo próprio porque é a única linha que o bundler trata como ponto de entrada de
   worker, e tanto o Vite quanto o webpack seguem essa URL ao resolver módulos.
2. `engine/image/decode.ts` — `createImageBitmap` + `OffscreenCanvas`, com fallback WASM.
3. `lib/{download,fsAccess}.ts` — `URL.createObjectURL` e `showDirectoryPicker`.

Tudo isso é coberto pelo E2E, que é a única camada que precisa mesmo de um navegador.

---

## 5. O que o build produz

```
out/
  index.html                    34 KB cru · 7,2 KB gzip, com o conteúdo todo dentro
  comprimir-imagem/ …           três landings de SEO
  sitemap.xml · robots.txt      gerados na build
  opengraph-image               PNG gerado por ImageResponse na build
  _next/static/chunks/
    …                           8 scripts iniciais · 175 KB gzip · zero codec
    compressify-image.<hash>.js o worker de imagem
    compressify-zip.<hash>.js   o worker de ZIP
  _next/static/media/
    *.wasm                      14 arquivos, 9,7 MB — baixados sob demanda
```

**Nenhuma serverless function.** É o que torna a promessa de privacidade estrutural em vez
de comportamental: não existe endpoint para onde enviar. O CI falha se o build gerar
alguma.

---

## 6. O que ainda não é assim

- **`avif_enc_mt` e as variantes multi-thread** são emitidas e nunca usadas: elas só
  entram em ação com `crossOriginIsolated`, que exige COOP/COEP. São 3,4 MB de
  armazenamento no host, zero banda de usuário. O gatilho para tratar é a Fase 3.
- **OPFS** ficou para a Fase 3. `Blob` já é respaldado em disco pelos navegadores.
- **TIFF está fora** — não há decoder no jSquash e nenhum navegador além do Safari
  decodifica. A recusa é explicativa, não silenciosa.
