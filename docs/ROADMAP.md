# Roadmap

> O que existe, o que vem depois e — mais útil — **o que já está preparado para receber o
> que vem depois**. Escrito no fim da Fase 1, com o produto rodando e provado.

---

## Fase 1 — Imagens ✅

Concluída. JPG, PNG, WebP e AVIF; compressão em lote com progresso e cancelamento;
conversão entre formatos; meta de tamanho; download individual, ZIP e File System Access;
três landings de SEO; 348 testes de unidade e 97 E2E em Chromium, Firefox e WebKit.

**Os 10 critérios de aceite estão fechados.** O último a cair foi o #2: o modo meta
produz saídas dentro de **+0,4%** das do app Electron sobre os mesmos bytes — a medição
está em [`COMPARACAO-ELECTRON.md`](COMPARACAO-ELECTRON.md) e é reproduzível com
`npm run paridade`.

---

## Fase 2 — PDF

**O que muda no código:** um arquivo novo, `engine/pdf/engine.ts`, implementando
`CompressionEngine`, e uma linha no registro.

Isso não é otimismo — é o que a Fase 1 comprou. O contrato foi mantido genérico desde o
começo (`supports` / `probe` / `process` sobre `File` e `Blob`, sem nada de imagem no
tipo), a fila e o pool nunca mencionam `ImageEngine`, e o orquestrador já recebe a política
de aceitação por injeção. Um `PdfEngine` entra sem tocar em fila, orçamento, cancelamento,
nomenclatura ou saída.

**O que precisa ser decidido:**

- **A biblioteca.** `pdf-lib` reescreve o documento e resolve compressão de estrutura, mas
  não recomprime as imagens embutidas — que é de onde vem o peso de um PDF de digitalização.
  O caminho provável é `pdf-lib` para o container e o **motor de imagem que já existe**
  para os objetos `XObject/Image`, o que faria a Fase 2 reaproveitar a Fase 1 de verdade.
- **O orçamento de memória.** `budget.ts` conta megapixels. Um PDF não tem dimensões; vai
  precisar de um custo estimado a partir do número de páginas e do tamanho do arquivo.
- **A regra de `probe`.** Ler o cabeçalho de um PDF para saber contagem de páginas sem
  parsear o documento inteiro.
- **O que "qualidade" significa** na UI quando o arquivo é um PDF. Provavelmente a mesma
  faixa, aplicada às imagens internas.

**Cuidado conhecido:** a `landing` e os chips de formato assumem quatro formatos de imagem.
Generalizá-los é trabalho de UI, não de motor.

---

## Fase 3 — Vídeo e áudio

O salto grande, e o único que exige mexer em infraestrutura.

**O que muda:** `ffmpeg.wasm` precisa de `SharedArrayBuffer`, que exige
`crossOriginIsolated`, que exige os cabeçalhos **COOP/COEP** na resposta. Numa exportação
estática isso vira configuração de host (`vercel.json`), não código.

**Três consequências que já estão mapeadas:**

1. **As variantes multi-thread dos codecs de imagem deixam de ser código morto.** Hoje
   `avif_enc_mt`, `hqx` e `magic-kernel` são 3,4 MB emitidos e nunca baixados; com
   `crossOriginIsolated` ligado eles passam a entrar em ação — e o AVIF fica mais rápido de
   graça. É por isso que eles não foram removidos.
2. **COEP quebra recursos de terceiros sem `Cross-Origin-Resource-Policy`.** O produto não
   carrega nenhum, e as fontes são auto-hospedadas — a decisão de privacidade da Fase 1
   paga aqui também.
3. **O Turbopack precisa ser revisitado.** O build de produção já trava com os pacotes
   multi-thread do jSquash ([`HANDOFF.md` §4](HANDOFF.md)); com `ffmpeg.wasm` no grafo o
   problema tende a piorar antes de melhorar.

**Também entra:** OPFS. Um vídeo de 2 GB não cabe num `Blob` em memória com folga, e o
armazenamento de origem privado é a resposta certa — foi deliberadamente adiado na Fase 1
porque `Blob` já é respaldado em disco para os tamanhos de imagem.

**O teto de tempo por job (20 s)** foi calibrado para imagens. Vídeo precisa de outra
ordem de grandeza, e provavelmente de progresso vindo do próprio `ffmpeg` em vez de
contagem de tentativas.

---

## Melhorias independentes de fase

Oito itens entraram nesta lista no fim da Fase 1. **Sete foram feitos**; o oitavo continua
parado de propósito.

|     | O quê                                        | Situação                                                          |
| --- | -------------------------------------------- | ----------------------------------------------------------------- |
| ✅  | ~~Comparação com o app Electron~~            | fechou o último critério de aceite — `COMPARACAO-ELECTRON.md`     |
| ✅  | ~~Perfis de saída~~ (web, e-mail, impressão) | `lib/profiles.ts`; o perfil aceso é derivado das opções           |
| ✅  | ~~Lembrar as preferências~~                  | `lib/preferences.ts`, com validação campo a campo                 |
| ✅  | ~~Comparação antes/depois~~                  | `<dialog>` nativo e divisória em `<input type="range">`           |
| ✅  | ~~Remover metadados EXIF~~                   | **já eram removidos** — ver abaixo                                |
| ✅  | ~~Progresso global na aba~~                  | contagem, não porcentagem — ver abaixo                            |
| ✅  | ~~PWA / uso offline~~                        | comprime sem rede depois da primeira compressão                   |
| 1   | **Enxugar os `.wasm` não usados**            | 3,4 MB de deploy — só depois que a Fase 3 decidir sobre COOP/COEP |

### Três que mudaram de forma ao serem implementadas

**O EXIF não precisava de uma opção.** A tarefa dizia "remover metadados opcionalmente",
imaginando uma caixinha para a foto de celular que carrega a coordenada de onde foi
tirada. Só que o pipeline decodifica para pixels e recodifica do zero: EXIF, IPTC, XMP e
perfil ICC **nunca** atravessaram. Não havia o que ligar; havia o que provar, e a prova é
`tests/integration/metadata.test.ts` — um JPEG com bloco EXIF de verdade, um marcador
dentro dele, e a verificação de que ele não está na saída em nenhum formato. A orientação
é a exceção deliberada: aplicada aos pixels, não preservada como metadado.

**O progresso na aba é uma contagem, não uma barra.** Uma porcentagem real exigiria a
média do progresso de todos os itens, ou seja, assinar `items` inteiro — exatamente o que
a store foi desenhada para evitar. A árvore repintaria dezenas de vezes por segundo para
animar um texto fora da tela. "12 de 50" responde melhor e sai de graça de `stats`.

**O PWA não precachêia os codecs.** O casco são 832 KB, extraídos do que os documentos
referenciam. Os 9,7 MB de `.wasm` entram no cache quando são usados — precacheá-los
cobraria de quem só abriu a página o custo de todos os formatos, desfazendo o
carregamento sob demanda do Incremento 3. O resultado é o item mais alinhado com a tese
do produto: **um compressor que roda inteiro no cliente não tem motivo nenhum para exigir
conexão**, e agora ele de fato não exige — há E2E comprimindo offline.

---

## Frente nova — conversão de formatos

Aberta em 26/07/2026, ainda sem código. A ideia: além de comprimir, **mudar o formato sem
comprimir**, no padrão "X para Y" que Convertio e CloudConvert popularizaram.

O que o estudo ([`PLANO-CONVERSAO.md`](PLANO-CONVERSAO.md)) apurou, medindo em vez de
supor: aqueles catálogos gigantes são o ImageMagick rodando **em servidor**, e as dez
categorias deles não são replicáveis com a promessa deste projeto. Mas a coluna de imagem
é — o `@imagemagick/magick-wasm` habilita **273 formatos, 247 lendo e 190 escrevendo**,
inteiramente no navegador, incluindo HEIC, RAW, TIFF, PSD e DICOM na entrada.

Três incrementos, em ordem de retorno sobre risco:

|     | O quê                                       | Depende de                     |
| --- | ------------------------------------------- | ------------------------------ |
| 13  | **Modo "Converter"**, sem comprimir         | nada — só os 4 formatos atuais |
| 14  | **Interface "X para Y"** + landings geradas | nada                           |
| 15  | **`magick-wasm`** como motor secundário     | 13,9 MB de wasm, sob demanda   |

O roteiro para começar está em [`HANDOFF-CONVERSAO.md`](HANDOFF-CONVERSAO.md).

---

## O que não está no roadmap, e por quê

- **Conta de usuário, histórico, sincronização.** Exigiriam servidor, e o servidor é
  exatamente o que este projeto se recusa a ter.
- **Processar no servidor "para arquivos grandes".** A promessa não tem asterisco.
- **TIFF.** Não há decoder no jSquash e nenhum navegador além do Safari decodifica. A
  recusa é explicativa, e continua sendo a resposta certa até que exista um decoder.
- **Analytics.** Nem anônimo. Um produto que promete não enviar arquivos e envia
  telemetria escolheu qual promessa levar a sério.
