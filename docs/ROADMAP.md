# Roadmap

> O que existe, o que vem depois e — mais útil — **o que já está preparado para receber o
> que vem depois**. Escrito no fim da Fase 1, com o produto rodando e provado.

---

## Fase 1 — Imagens ✅

Concluída. JPG, PNG, WebP e AVIF; compressão em lote com progresso e cancelamento;
conversão entre formatos; meta de tamanho; download individual, ZIP e File System Access;
três landings de SEO; 309 testes de unidade e 60 E2E em Chromium, Firefox e WebKit.

Fica um item de acabamento em aberto, rastreado em [`HANDOFF.md` §14](HANDOFF.md):
comparar numericamente as saídas do modo meta com as do app Electron sobre as mesmas
imagens (o critério de aceite #2 pede ±10%). O motor está verificado; falta a comparação.

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

Coisas que valem por si, em ordem de retorno por esforço:

|     | O quê                                                   | Por quê                                                           |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | **Comparação com as fixturas do Electron**              | fecha o último critério de aceite da Fase 1                       |
| 2   | **Presets de saída** ("web", "e-mail", "impressão")     | a maior parte dos usuários não quer escolher qualidade em número  |
| 3   | **Lembrar as preferências** (`localStorage`)            | quem comprime para web comprime para web sempre                   |
| 4   | **Comparação antes/depois** com slider na imagem        | a pergunta que todo mundo faz é "perdeu qualidade?"               |
| 5   | **Remover metadados EXIF opcionalmente**                | privacidade de novo: geolocalização em foto de celular            |
| 6   | **Barra de progresso global** na aba (`document.title`) | lote de 50 arquivos é tempo de trocar de aba                      |
| 7   | **Enxugar os `.wasm` não usados**                       | 3,4 MB de deploy — só depois que a Fase 3 decidir sobre COOP/COEP |
| 8   | **PWA / uso offline**                                   | um app que não precisa de rede tem tudo para funcionar sem ela    |

O item 8 é o mais alinhado com a tese do produto: **um compressor que roda inteiro no
cliente não tem motivo nenhum para exigir conexão** depois do primeiro carregamento.

---

## O que não está no roadmap, e por quê

- **Conta de usuário, histórico, sincronização.** Exigiriam servidor, e o servidor é
  exatamente o que este projeto se recusa a ter.
- **Processar no servidor "para arquivos grandes".** A promessa não tem asterisco.
- **TIFF.** Não há decoder no jSquash e nenhum navegador além do Safari decodifica. A
  recusa é explicativa, e continua sendo a resposta certa até que exista um decoder.
- **Analytics.** Nem anônimo. Um produto que promete não enviar arquivos e envia
  telemetria escolheu qual promessa levar a sério.
