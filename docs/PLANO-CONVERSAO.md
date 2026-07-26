# Conversão de formatos — estudo de viabilidade e plano

> **Documento de decisão, não de implementação.** Nada aqui foi construído. Ele existe
> para responder três perguntas antes de escrever código: isto cabe neste projeto? o que
> dá para fazer sem servidor? e por onde começar?
>
> Escrito em 26/07/2026, depois dos Incrementos 9–12. Os números de tamanho e tempo foram
> **medidos nesta máquina**, não estimados — a metodologia está no §3.

---

## 1. A pergunta do Igor, respondida primeiro

> _"Seria interessante concentrar essa possibilidade nesse projeto, certo? Não criar um
> novo só pra isso."_

**Sim, e o argumento é mais forte do que "evita duplicar trabalho".**

1. **A infraestrutura já é genérica, e isso foi de propósito.** O contrato
   `CompressionEngine` (`supports` / `probe` / `process` sobre `File` e `Blob`) não
   menciona imagem em lugar nenhum. Fila, pool, orçamento de memória, cancelamento,
   retentativa, nomenclatura única, download, ZIP e File System Access **funcionam sem
   uma linha de alteração** para qualquer motor novo. Um projeto separado começaria
   reescrevendo os Incrementos 4, 5 e 6.
2. **O produto já se posiciona como conversor.** Duas das três landings de SEO são
   `/converter-webp` e `/converter-avif`. A fileira de formatos de saída na tela já é uma
   escolha de destino. Conversão não é um enxerto: é o que metade da interface já promete.
3. **A promessa de privacidade não se divide bem.** "Nada é enviado" é uma propriedade
   estrutural de _um_ deploy sem função de servidor. Dois produtos com a mesma promessa
   dobram a superfície onde ela pode ser quebrada, e o segundo não herda os testes de
   `privacy.spec.ts`.
4. **O ganho de busca é assimétrico.** "heic para jpg" e "cr2 para jpg" são buscas de
   volume alto e intenção altíssima. Cada par de formatos é uma landing, e a máquina de
   gerar landing já existe (`ToolPage` + `StructuredData`).

**A ressalva honesta:** o nome do produto é _Compressify_ e o herói diz "Comprima
qualquer imagem". Se a conversão virar metade do produto, isso é uma decisão de
posicionamento, não só de código. Ela não precisa ser tomada agora — o §6 propõe uma
ordem em que a conversão cresce sem exigir reposicionamento antecipado.

---

## 2. O que os prints realmente mostram

Antes de planejar cópia, vale saber o que se está copiando.

**Aquela lista é o catálogo do ImageMagick.** A ordem alfabética — 3FR, ARW, AVIF, BMP,
CR2, CRW, CUR, DCM, DCR, DDS, DNG, ERF, EXR, FAX, FTS, G3, G4, GIF, GV, HDR, HEIC, HEIF,
HRZ, ICO, IIQ, IPL, JBG — é literalmente a tabela de formatos do ImageMagick. O Convertio
e o CloudConvert são **serviços de servidor**: o arquivo sobe, o ImageMagick (ou o
LibreOffice, ou o FFmpeg) roda numa máquina deles, e o resultado desce.

Isso tem duas consequências diretas:

- **As dez categorias do menu (Imagem, Documento, EBook, Áudio, Arquivo, Vídeo,
  Apresentação, Fonte, Vetor, CAD) não são replicáveis sem servidor.** Copiar o menu
  inteiro seria prometer o que não se entrega — e para este projeto seria pior que isso,
  porque a única forma de entregar seria subindo o arquivo, que é exatamente o que ele se
  recusa a fazer.
- **A parte de imagem é replicável quase inteira.** É o que o §3 mede.

A conclusão é copiar o **padrão de interação** ("X para Y", com busca), não o catálogo.

---

## 3. O que é viável no navegador — medido

### 3.1 A descoberta que muda o plano

`@imagemagick/magick-wasm` é o ImageMagick 7 compilado para WebAssembly, rodando no
navegador. Instalei a versão **0.0.41** (publicada em 20/06/2026) e enumerei o que ela de
fato habilita, em vez de confiar no "mais de 100 formatos" do README:

```
TOTAL: 273 formatos  |  lê: 247  |  escreve: 190
```

Os formatos dos prints, um a um:

| Formato                                                             | Lê  | Escreve | Observação                                  |
| ------------------------------------------------------------------- | --- | ------- | ------------------------------------------- |
| 3FR, ARW, CR2, CRW, DCR, DNG, ERF, IIQ                              | ✅  | ❌      | RAW de câmera — ninguém converte _para_ RAW |
| HEIC, HEIF                                                          | ✅  | ❌      | Escrita bloqueada por licença               |
| DCM (DICOM)                                                         | ✅  | ❌      | Imagem médica                               |
| AVIF, BMP, CUR, DDS, EXR, FAX, FTS, G3, G4, GIF, HDR, HRZ, ICO, IPL | ✅  | ✅      |                                             |
| JPEG, PNG, TIFF, PSD, TGA, WEBP, JXL, SVG, PDF, EPS                 | ✅  | ✅      |                                             |
| GV, JBG                                                             | —   | —       | Ausentes desta build                        |

Ou seja: **a coluna "Imagem" dos prints é entregável no cliente, com duas exceções
(GV e JBG) e a regra óbvia de que RAW e HEIC só entram como origem.**

Que RAW e HEIC sejam só de leitura não é limitação prática — é o caso de uso real.
Ninguém pede "JPG para CR2"; todo mundo pede "CR2 para JPG" e "HEIC para JPG".

### 3.2 O custo

| Item                | Tamanho     |
| ------------------- | ----------- |
| `magick.wasm` cru   | **13,9 MB** |
| com gzip            | **5,0 MB**  |
| com brotli          | **3,7 MB**  |
| `index.js` com gzip | 65 KB       |

Para comparação, o deploy inteiro hoje tem 12 MB de `.wasm`, dos quais o usuário baixa no
máximo alguns megabytes — e só quando usa o formato correspondente.

**Isto só é aceitável sob a mesma regra do Incremento 3: carregamento sob demanda,
import dinâmico, fora do bundle inicial e fora do precache do service worker.** A
arquitetura já faz exatamente isso com os codecs do jSquash; o `magick.wasm` entraria na
mesma esteira, e o `scripts/gerar-sw.mjs` já exclui `.wasm` do casco por decisão tomada.

### 3.3 A velocidade

Medido em Node 24 (mesma família de motor do Chromium), imagem sintética de 1600×1200
(1,9 MP) com entropia de fotografia:

| Operação               | Saída   | Tempo      |
| ---------------------- | ------- | ---------- |
| Inicializar o WASM     | —       | **~80 ms** |
| PNG → TIFF (sem perda) | 5,49 MB | 51 ms      |
| PNG → BMP (sem perda)  | 5,49 MB | 39 ms      |
| PNG → PSD              | 9,36 MB | 206 ms     |
| PNG → ICO 256          | 0,19 MB | 103 ms     |
| PNG → JPG q92          | 0,76 MB | 110 ms     |
| TIFF → PNG (volta)     | 3,41 MB | 522 ms     |
| PSD → PNG (volta)      | 3,41 MB | 607 ms     |
| JPG → PNG (sem perda)  | 2,23 MB | 699 ms     |

O TIFF volta para PNG com **exatamente os 3,41 MB do original** — a ida e volta é sem
perda, como tem que ser.

Os tempos cabem folgados no teto de 20 s por job. O `init` de 80 ms acontece uma vez por
worker.

### 3.4 As outras categorias, sem otimismo

| Categoria        | Viável no cliente? | Como, e o que custa                                                                                                                   |
| ---------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Imagem**       | ✅ **Sim**         | `magick-wasm` — 247/190 formatos, medido acima                                                                                        |
| **Fonte**        | ✅ Sim, e barato   | `wawoff2` (1,2 MB) faz TTF/OTF ↔ WOFF2; WOFF1 é zlib puro                                                                             |
| **Arquivo**      | ✅ Sim             | `fflate` já está no projeto (ZIP); `libarchive.js` (2,3 MB) adiciona 7z, RAR, TAR                                                     |
| **Vetor**        | 🟡 Metade          | SVG → raster: sim, o `magick` faz. Raster → SVG exige _tracing_ (potrace), que é uma decisão de qualidade, não de formato             |
| **Documento**    | 🟡 Só PDF          | PDF ↔ imagem: sim. **DOCX/XLSX/PPTX: não.** Exigiria LibreOffice em WASM, que em 2026 continua grande e instável demais para produção |
| **Apresentação** | ❌ Não             | Mesmo motivo do Office                                                                                                                |
| **EBook**        | 🟡 Marginal        | EPUB é um ZIP; converter para MOBI/AZW3 exige reimplementar formatos proprietários. Valor baixo, custo alto                           |
| **Áudio/Vídeo**  | ⏳ Fase 3          | `ffmpeg.wasm`, que exige `SharedArrayBuffer` → `crossOriginIsolated` → COOP/COEP. Já está planejado no [`ROADMAP.md`](ROADMAP.md)     |
| **CAD**          | ❌ Não             | DWG é proprietário e sem implementação WASM viável. DXF seria parser próprio, e ninguém pede                                          |

**O veredito:** das dez categorias, **três e meia** são entregáveis com a promessa
intacta (imagem, fonte, arquivo, metade de vetor), uma é a Fase 3 já planejada, e as
outras exigiriam servidor. Prometer as dez seria vender o que não se tem.

---

## 4. "Sem comprimir" — o pedido literal, e o menor de todos

O Igor pediu especificamente **mudar o formato sem comprimir**. Vale separar isso do
catálogo, porque é uma feature pequena, imediata e que **não precisa do `magick-wasm`**.

Hoje o motor tem dois modos: `auto` (desce a escada de qualidade até ficar menor que o
original) e `target` (busca binária até caber na meta). Os dois **sempre comprimem** — é o
que o produto faz.

Falta um terceiro: **`convert`**, que decodifica e recodifica uma vez só, no melhor ponto
que o formato de destino permite. Nos quatro formatos que já existem:

| Destino | O que "sem comprimir" significa                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------ |
| PNG     | Já é sem perda por definição — só desligar o quantizador (`quality ≥ 88`)                                          |
| WebP    | `lossless: true` no encoder — o jSquash expõe, hoje não usamos                                                     |
| AVIF    | Modo lossless existe; custo de tempo precisa ser medido                                                            |
| JPEG    | **Não existe JPEG sem perda.** Aqui "sem comprimir" só pode significar qualidade máxima, e a UI precisa dizer isso |

**Um aviso de produto que a UI vai precisar dar:** converter um JPEG de 3,8 MB para PNG
sem perda produz um arquivo **maior** — na medição acima, um JPEG virou um PNG de 2,23 MB
onde o original tinha 0,76 MB. Isso é correto e esperado (o PNG guarda os pixels que o
JPEG jogou fora), mas um usuário que clica em "converter" e recebe um arquivo três vezes
maior sem explicação acha que o produto quebrou. O card já tem o lugar certo para dizer
isso: o campo `message` com status `warning`, que existe desde o Incremento 3.

**Custo estimado:** um modo novo em `strategy.ts` (uma função de ~15 linhas, sem busca),
um caminho em `encodeImage` para lossless, um botão a mais no `SegmentedControl` de modo,
e testes. É o menor incremento do plano e o único que não adiciona dependência nenhuma.

---

## 5. Onde isto encosta na arquitetura — os pontos de atrito

Cinco lugares onde a conversão **não** entra de graça. Nenhum é bloqueante; todos são
trabalho que precisa estar no plano.

### 5.1 O `probe` não sabe ler 247 cabeçalhos

`probe.ts` lê cabeçalho de PNG, JPEG, WebP e AVIF. Para um CR2 ele devolve `null`, e o
`ImageEngine` cai no fallback: **decodificar para medir**. Com o `magick-wasm` isso
significaria baixar 14 MB e decodificar um RAW de 50 MP só para o pool saber o custo do
job — antes de decidir se despacha.

**Saída:** para formatos fora dos quatro conhecidos, estimar o custo pelo tamanho do
arquivo em vez de decodificar (um RAW de 25 MB tem ordem de grandeza previsível). O
`budget.ts` conta megapixels; a estimativa entra como megapixels equivalentes.

### 5.2 O orçamento e o teto de 20 s foram calibrados para 4 formatos

Um RAW de 50 MP decodifica para ~200 MB de RGBA. O orçamento de 96 MP em voo e o teto de
20 s por job continuam valendo, mas a **hipótese** por trás deles muda. Precisa de
medição nova, não de fé.

### 5.3 Dois motores para os mesmos quatro formatos

O `magick-wasm` também faz JPEG, PNG, WebP e AVIF. **Não trocar o jSquash por ele.** A
paridade de ±0,4% com o app Electron ([`COMPARACAO-ELECTRON.md`](COMPARACAO-ELECTRON.md))
é um ativo medido, e o jSquash é o que a produziu — além de ser muito menor. A regra:

> O `magick-wasm` só entra quando o formato de origem **ou** de destino está fora dos
> quatro que o jSquash cobre.

Isso mantém o caminho comum barato e rápido, e é a mesma disciplina de "não cobrar de
todo mundo o custo de todos os formatos" que já governa o precache do service worker.

### 5.4 O bundler

O build de produção do Turbopack **trava** com os pacotes multi-thread do jSquash
([`HANDOFF.md` §4](HANDOFF.md)) — por isso `--webpack`. O `magick-wasm` precisa ser
testado nesse mesmo eixo **antes** de qualquer commit de integração; ele carrega o `.wasm`
por URL explícita, o que é um bom sinal, mas sinal não é medição.

### 5.5 Licença e crédito

O ImageMagick tem licença própria, derivada da Apache 2.0, que exige atribuição. O projeto
é MIT e hoje não depende de nada que peça aviso. Antes de integrar: ler a licença e
acrescentar o aviso onde for devido. É barato e não pode ser esquecido.

---

## 6. O plano, em incrementos

Cada um é entregável sozinho, com teste, e o projeto continua no ar se o seguinte nunca
acontecer. A ordem é por **retorno sobre risco**, não por tamanho.

### Incremento 13 — o modo "Converter" (sem comprimir)

Sem dependência nova. Só os quatro formatos que já existem.

- Terceiro modo em `JobOptions`: `auto` · `meta` · **`converter`**
- Lossless de verdade onde o formato permite (PNG, WebP, AVIF); qualidade máxima no JPEG,
  com o aviso de que JPEG não tem sem perda
- Aviso de "ficou maior que o original" no card — o mecanismo já existe
- Testes: unidade na estratégia, integração com codecs reais provando ida e volta sem
  perda, E2E convertendo no navegador

**Pronto quando:** um PNG vira WebP sem perda, volta a PNG e os pixels batem.

### Incremento 14 — a interface "X para Y"

Ainda sem dependência nova. É o padrão dos prints, aplicado ao que já funciona.

- Seletor de origem → destino no topo da ferramenta, com busca
- Cada par vira uma landing gerada (`/jpg-para-webp`, `/png-para-avif`, …) reusando
  `ToolPage` e `StructuredData` — a máquina de SEO já existe
- O seletor de origem filtra a fila, não o motor: quem arrastar um PNG numa página de
  "JPG para WebP" não pode ser recusado sem explicação

**Pronto quando:** as landings existem, o sitemap as inclui e o E2E navega numa delas e
converte.

### Incremento 15 — `magick-wasm` como motor secundário

O salto de capacidade, e o de risco.

- `engine/magick/engine.ts` implementando `CompressionEngine`
- Registro escolhe o motor por formato: jSquash para os quatro, `magick` para o resto
- Estimativa de custo por tamanho de arquivo (§5.1)
- Import dinâmico, fora do bundle inicial, verificado como o Incremento 3 verificou
- **Formatos de entrada novos:** HEIC, TIFF, PSD, RAW (CR2, ARW, DNG, NEF…), ICO, BMP,
  DDS, GIF, SVG
- **Formatos de saída novos:** TIFF, BMP, ICO, GIF, PSD, JXL
- Medir memória e tempo com um RAW real antes de liberar

**Pronto quando:** um CR2 e um HEIC viram JPG nos três navegadores, o bundle inicial
continua sem um byte de `magick`, e o Lighthouse não se move.

**Nota de oportunidade:** este incremento resolve sozinho a decisão nº 5 do
[`HANDOFF.md` §13](HANDOFF.md) — _"TIFF está fora, não há decoder"_. Passa a haver.

### Incremento 16 — fontes e arquivos (opcional, barato)

- TTF/OTF ↔ WOFF/WOFF2 com `wawoff2` (1,2 MB)
- ZIP → TAR/7z com `libarchive.js`, se houver demanda

Entra se, e só se, alguém pedir. Está aqui para registrar que é barato, não para prometer.

### Não entra no plano

- **DOCX, XLSX, PPTX e CAD.** Exigiriam servidor. A promessa não tem asterisco — a mesma
  frase que o [`ROADMAP.md`](ROADMAP.md) já usa para recusar "processar no servidor para
  arquivos grandes".
- **Trocar o jSquash pelo `magick-wasm`** nos quatro formatos atuais. §5.3.
- **Copiar as dez categorias do menu.** §2.

---

## 7. O que eu recomendo

**Fazer os Incrementos 13 e 14 agora, e decidir o 15 depois de vê-los no ar.**

O 13 é o que o Igor pediu literalmente, não tem dependência, não tem risco e melhora o
produto de hoje. O 14 multiplica as landings usando maquinário que já existe e testa a
hipótese de que "converter" é o que as pessoas buscam — com dado, não com opinião.

O 15 é o que transforma o produto, e é também o que traz 14 MB de WebAssembly, um motor
secundário e uma licença nova. Ele fica muito mais fácil de decidir depois que as landings
do 14 mostrarem se a busca por conversão existe de verdade.

**O que eu não recomendo é começar pelo 15.** Não porque seja inviável — está medido, é
viável — mas porque é a ordem que gasta o risco antes de ter a informação que justifica
gastá-lo.
