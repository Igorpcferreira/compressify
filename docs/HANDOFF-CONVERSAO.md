# Handoff da conversão — como começar

> **Este é o documento para abrir uma sessão nova.** Quem retomar a frente de conversão
> de formatos — pessoa ou sessão de IA — lê **este arquivo primeiro**, depois
> [`PLANO-CONVERSAO.md`](PLANO-CONVERSAO.md) (o estudo que justifica as decisões) e só
> então [`HANDOFF.md`](HANDOFF.md) (o estado geral do projeto).
>
> Escrito em 26/07/2026. **Os Incrementos 13 e 14 estão feitos** — o modo "Converter" (§5)
> e as doze landings "X para Y" com o seletor de par (§6). O que resta desta frente é o
> **Incremento 15** (§7), que é uma decisão do Igor antes de ser código: 14 MB de
> WebAssembly, um segundo motor e uma licença nova.
>
> **Duas correções ao estudo, ambas medidas:** o `@jsquash/avif` 2.1.1 **tem** modo sem
> perda e ele é bit-exato (decisão nº 5 do §4); e o AVIF **sem perda** sai **maior** que o
> PNG — +45% numa foto, +515% em arte chapada —, o que muda o que duas landings podem
> prometer (§6).

---

## 1. O que colar na sessão nova

Copie o bloco abaixo como primeira mensagem:

```
Vamos continuar o Compressify. Leia docs/HANDOFF-CONVERSAO.md primeiro — ele é o
roteiro desta frente e diz o que já está decidido. Depois leia
docs/PLANO-CONVERSAO.md (o estudo) e docs/HANDOFF.md (o estado do projeto).

Os Incrementos 13 e 14 estão feitos. Antes de escrever qualquer código do
Incremento 15, resolva os cinco pontos de atrito do §5 do PLANO-CONVERSAO e me
mostre a conclusão — inclusive a licença do ImageMagick.

Você tem autorização para commitar e dar push sem me perguntar. Rode
`npm run check` e o E2E antes de cada commit.
```

**O Incremento 15 não deve começar sem decisão.** Ele traz 14 MB de WebAssembly, um
segundo motor de imagem e uma licença que exige atribuição — as três coisas são
irreversíveis na prática depois de publicadas. O §7 diz o que precisa estar resolvido
antes.

---

## 2. Regras de trabalho válidas hoje

O [`HANDOFF.md` §1](HANDOFF.md) tem uma lista de regras do brief original. **Uma delas
está revogada:**

> ~~Nunca fazer `git commit` ou `git push` sem autorização explícita.~~
> **Revogada em 26/07/2026.** O Igor autorizou commitar e empurrar sem perguntar.

As outras continuam valendo, e são o que faz este projeto ser o que é:

1. **Um incremento por vez.** Terminar, mostrar, parar.
2. **Discordar quando algo estiver tecnicamente errado**, com argumento, antes de
   implementar.
3. **Verificar versões antes de fixar dependências.** A data de conhecimento do modelo
   pode estar defasada — isso já pegou três armadilhas reais.
4. **Medir antes de afirmar.** Todo número neste projeto foi medido. Se você for escrever
   um número em documento, meça primeiro.

---

## 3. O estado, em uma tela

```bash
cd Compressify
npm install
npm run check              # 389 testes, ~50 s
npm run build              # exportação estática + service worker
npx playwright install     # uma vez
npm run e2e                # 115 testes em Chromium, Firefox e WebKit
npm run dev                # http://localhost:3000
```

A Fase 1 está fechada com os 10 critérios de aceite medidos; sete dos oito itens do
[`ROADMAP.md`](ROADMAP.md) foram feitos. O que falta fora desta frente é **o deploy**, que
é decisão do Igor.

Se o `next build` reclamar de `RealContentHashPlugin` ("an asset was cached with a
reference to another asset that's not in the compilation anymore"), é cache velho do
`.next`: apagar a pasta e rodar de novo resolve.

**Feche dev servers deste projeto antes de `npm run build`** — rodar os dois no mesmo
`.next` trava o build sem mensagem.

---

## 4. O que já está decidido — não reabrir sem motivo novo

Estas saíram do estudo. Reabri-las custa tempo e não muda a resposta:

1. **A conversão fica neste projeto**, não em um projeto novo. O contrato
   `CompressionEngine` já é genérico e fila, pool, orçamento, cancelamento, nomenclatura
   e as três saídas funcionam sem alteração.
2. **Não copiar as dez categorias do Convertio.** Aquilo é o catálogo do ImageMagick
   rodando em servidor. Documento do Office, apresentação e CAD não são viáveis no
   cliente e não entram.
3. **Não trocar o jSquash pelo `magick-wasm`** nos quatro formatos atuais. A paridade de
   ±0,4% com o app Electron foi medida com o jSquash e é um ativo.
4. **Ordem:** Incremento 13 → 14 → decidir o 15. Não começar pelo 15.
5. ~~**AVIF não tem lossless real aqui.**~~ **Corrigido em 26/07/2026, com medição.** O
   `@jsquash/avif` 2.1.1 **expõe** `lossless: boolean` — a flag fixa `quality: 100`,
   `qualityAlpha: -1` e `subsample: 3` (YUV 4:4:4), e a ida e volta sobre ruído RGB puro,
   com e sem alfa, devolve **os mesmos bytes**. O AVIF entrou no modo converter como sem
   perda de verdade. O que continua valendo: **JPEG não tem modo sem perda**, e a UI diz
   isso com todas as letras.

---

## 5. Incremento 13 — o modo "Converter" ✅ **feito**

**O objetivo:** mudar o formato do arquivo sem passar pela busca de compressão. Um decode,
um encode, no melhor ponto que o formato de destino permite.

**Sem dependência nova.** Só os quatro formatos que já existem.

### 5.1 O que mudou, arquivo por arquivo

| Arquivo                                 | Mudança                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/engine/core/types.ts`              | `COMPRESSION_MODES` passa a ser **valor**, e `CompressionMode` deriva dele — §5.5            |
| `src/engine/image/strategy.ts`          | `renderConvert()` — um encode, sem busca, com o aviso de "ficou maior"                       |
| `src/engine/image/codecs.ts`            | `encodeImage` aceita `{ lossless }`; WebP `lossless: 1` **+ `exact: 1`**, AVIF `lossless`    |
| `src/engine/image/engine.ts`            | Roteia para `renderConvert`, passa o pedido de lossless e estima 1 encode no progresso       |
| `src/lib/preferences.ts`                | `MODES` passa a ser a lista do tipo, em vez de uma cópia — a armadilha do §5.5 some          |
| `src/components/queue/OptionsPanel.tsx` | Terceiro botão de modo; a qualidade dá lugar à explicação de cada destino                    |
| `src/components/queue/FileCard.tsx`     | Badge âmbar quando o arquivo cresce; "Convertendo" no lugar de "Comprimindo"                 |
| `src/components/queue/ActionBar.tsx`    | "Converter tudo" no modo converter, e "a mais" em vez de "economizados" quando o lote cresce |
| `src/store/queue.ts`                    | `selectMode` — primitivo, para o card e a barra lerem o modo sem assinar as opções           |

Os dois últimos não estavam na lista original. Entraram pelo mesmo argumento do §5.4: um
botão "Comprimir tudo" num modo que não comprime é a interface mentindo, igual ao badge
verde.

### 5.2 A estratégia

`strategy.ts` é puro e não importa nada. A função nova segue a forma das outras duas:

```ts
export async function renderConvert(
  render: Renderer,
  options: { quality: number; originalBytes: number },
  ctx?: StrategyContext,
): Promise<RenderOutcome>
```

Um `render({ quality, scale: 1 })`, e pronto. Sem escada, sem busca binária, sem
downscale. `encodes: 1`.

O `originalBytes` não estava na assinatura proposta e entrou porque o aviso é da
estratégia, não do motor: `RenderOutcome.warning` só pode ser preenchido por quem compara
o resultado com a origem. O `ImageEngine` converte `warning` em `status: 'warning'` e o
card mostra a mensagem — nada disso precisou mudar.

Quem chama passa `QUALITY_MAX`: onde há modo sem perda a qualidade é ignorada, e no JPEG,
que não tem, "sem comprimir" só pode significar o teto. A regra fica num lugar só.

### 5.3 O que "sem comprimir" significa em cada formato

Isto é o coração do incremento. A tabela abaixo **não é mais leitura de tipos** — cada
linha foi medida com ida e volta pelo motor de produção, comparando pixel a pixel
(`tests/integration/convert-lossless.test.ts`):

| Destino  | O que faz                                             | É sem perda de verdade?                  |
| -------- | ----------------------------------------------------- | ---------------------------------------- |
| **PNG**  | Pula o quantizador, qualquer que seja a qualidade     | ✅ Sim, por definição do formato         |
| **WebP** | `lossless: 1` **e `exact: 1`**                        | ✅ Sim — inclusive nos pixels invisíveis |
| **AVIF** | `lossless: true` (q100 · qualityAlpha −1 · YUV 4:4:4) | ✅ Sim — bit-exato, medido               |
| **JPEG** | `QUALITY_MAX` (95)                                    | ❌ **Não existe JPEG sem perda**         |

**Duas descobertas que só apareceram medindo:**

1. **`exact: 1` no WebP não é preciosismo.** Sem ele o libwebp descarta o RGB dos pixels
   totalmente transparentes — 1.664 subpixels diferentes numa imagem de ruído com alfa,
   contra zero com a flag. O arquivo continua "sem perda" para quem só olha o que aparece,
   e deixa de ser para quem edita a imagem depois. Custa ~6% de bytes.
2. **O AVIF tem lossless de verdade** — ver a correção na decisão nº 5 do §4.

**A UI diz isso**, no painel, em modo converter: _"PNG, WebP e AVIF saem sem perda nenhuma
— os pixels do original são preservados byte a byte. JPEG não tem modo sem perda: sai na
qualidade máxima."_ E o slider de qualidade **some** nesse modo: ele não faria nada, e
controle inerte na tela ensina a ignorar a tela.

### 5.4 O aviso que o produto precisa dar

Converter um JPEG para PNG sem perda produz um arquivo **maior**. Medido no estudo:
0,76 MB de JPEG viram 2,23 MB de PNG. Está correto — o PNG guarda os pixels que o JPEG
jogou fora — mas sem explicação lê como defeito.

Três coisas, todas feitas:

1. **A mensagem.** `MESSAGES.convertLarger` — _"O formato escolhido guarda mais informação
   que o original, então o arquivo ficou maior."_ Ela vem da estratégia, não do motor, e
   por isso ganha da genérica `largerThanOriginal`, que continua valendo nos outros modos.
2. **A cor do badge.** Âmbar (`bg-warning`) quando o número é positivo, verde quando é
   negativo. A cor usa **o mesmo arredondamento do texto** — um `−0,2%` é exibido como
   "0%" e continua verde, senão a mentira seria ao contrário.
3. **O resumo do lote.** "8,4 MB **a mais**" em vez de "8,4 MB economizados" quando a soma
   cresce. O `formatBytes` devolvia "0 B" para valor negativo, então a frase antiga ficava
   literalmente sem número.

### 5.5 A armadilha que nenhum teste pegava — resolvida na estrutura

`src/lib/preferences.ts` valida o que vem do `localStorage` campo a campo, contra listas
fechadas. A lista de modos era escrita à mão:

```ts
const MODES: readonly CompressionMode[] = ['auto', 'target']
```

Acrescentar `'convert'` ao tipo e esquecer dessa linha **compila** (a lista é um
subconjunto válido do tipo) e não quebra nenhum teste. O sintoma aparece só em uso real: a
pessoa escolhe "Converter", fecha a aba, volta, e o painel está em "Auto" — porque a
validação rejeitou o valor guardado em silêncio.

A saída foi tirar a possibilidade do caminho, não só testá-la: `COMPRESSION_MODES` virou
**valor** em `engine/core/types.ts`, o tipo deriva dele, e a validação importa a lista.
Fonte única, esquecer deixa de ser possível. O teste que percorre todos os modos entrou
junto — ele agora protege contra alguém reintroduzir uma cópia local.

### 5.6 Definição de pronto — conferida

- [x] Um PNG vira WebP **sem perda**, volta a PNG, e os pixels batem byte a byte
- [x] Um JPEG vira PNG e o card avisa que ficou maior, com o badge **não verde**
- [x] A preferência "Converter" sobrevive ao recarregamento (§5.5)
- [x] O painel explica o que acontece em cada formato de destino
- [x] `npm run check` verde (368 testes); E2E verde nos três navegadores (100 testes)
- [x] Nenhuma dependência nova, e nenhum codec no bundle inicial — **medido**: 9 scripts
      iniciais, 182.034 → 182.374 bytes com gzip. São **+340 bytes**, não zero: o terceiro
      botão, o texto explicativo e a lista de modos são código de UI e ocupam espaço. O que
      é zero é dependência nova e código de codec vazando para o casco

### 5.7 Testes — 20 novos

- **Unidade** (`strategy.test.ts`, 5): `renderConvert` faz um encode só, na escala 1,
  clampa a qualidade, propaga o aviso quando cresce, e nem começa se já veio abortado.
- **Unidade** (`engine.test.ts`, 3): o motor pede o teto de qualidade e o lossless, não
  redimensiona, e devolve `warning` com a mensagem específica quando o arquivo cresce.
- **Unidade** (`preferences.test.ts`, 1): todos os modos declarados sobrevivem à validação.
- **Componente** (`file-card.test.tsx`, 5, jsdom): a cor do badge segue o número que está
  na tela, e o verbo do card segue o modo.
- **Store** (`queue-store.test.ts`, 1): o modo converter chega ao orquestrador.
- **Integração** (`convert-lossless.test.ts`, 5): com os codecs reais e o motor de
  produção, PNG → WebP → PNG e PNG → AVIF → PNG devolvem **os mesmos pixels**; o RGB atrás
  do alfa sobrevive; o PNG não é quantizado nem com qualidade 35; e o JPEG → PNG avisa.
- **E2E** (`queue.spec.ts`, 1 × 3 navegadores): converte no navegador, confere que o
  slider sumiu e que o arquivo baixado é `RIFF/WEBP` com o chunk **VP8L** — um WebP de
  qualidade alta traria `VP8 `, parecido na tela e diferente na promessa.

---

## 6. Incremento 14 — a interface "X para Y" ✅ **feito**

Sem dependência nova, como previsto. Doze landings geradas, um seletor de par no topo da
ferramenta, e o sitemap saindo da mesma lista que gera as rotas.

### 6.1 O que mudou, arquivo por arquivo

| Arquivo                                      | Mudança                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `src/lib/conversions.ts`                     | **Novo.** O catálogo dos doze pares e o texto de cada um — módulo folha    |
| `app/[conversao]/page.tsx`                   | **Novo.** As doze landings, via `generateStaticParams`                     |
| `src/components/landing/ConversionLinks.tsx` | **Novo.** A grade de links que impede as landings de nascerem órfãs        |
| `src/components/queue/ConversionBar.tsx`     | **Novo.** O seletor "de X para Y"                                          |
| `src/engine/image/format.ts`                 | `inputFormatOf` — o formato da entrada, ou `null` quando não dá para dizer |
| `src/store/queue.ts`                         | `sourceFormat`, `applyConversion`, `setSourceFormat` e `stats.foreign`     |
| `src/components/queue/QueueWorkspace.tsx`    | Aceita o par da landing e o aplica depois da hidratação                    |
| `src/components/landing/ToolPage.tsx`        | Repassa o par e ganha a faixa de destaque                                  |
| `app/sitemap.ts` · `app/page.tsx`            | As doze entradas e a grade de links na home                                |
| `scripts/gerar-sw.mjs`                       | Decodifica o caminho do chunk e tira as landings do casco — §6.4           |

### 6.2 Três decisões que valem discussão

**1. O seletor não tem campo de busca, e são `<select>` nativos.** O padrão dos prints tem
busca porque lista 300 formatos; aqui são quatro. Uma caixa de busca sobre quatro opções é
cerimônia — e o `select` nativo já faz busca por digitação, além de trazer teclado, leitor
de tela e o seletor de rolagem do celular sem uma linha de ARIA. Quando o Incremento 15
trouxer 247 formatos de entrada, aí um combobox com busca se paga; escrevê-lo agora seria
resolver hoje um problema que ainda não existe.

**2. A origem não filtra o motor — ela conta.** Quem chega por `/jpg-para-webp` e arrasta
um PNG tem o PNG convertido do mesmo jeito. O que a origem faz é alimentar
`stats.foreign`, e a barra diz _"2 arquivos da fila não são JPG. Eles serão convertidos do
mesmo jeito."_ Sem essa linha, a escolha de origem seria decorativa; com uma recusa, seria
uma escolha de vitrine virando regra de negócio. Há E2E para os dois lados.

**3. A contagem do que destoa é estado, não seletor.** Ela é calculada dentro do `tally`,
que já roda quando um job entra, sai ou termina — nunca a cada 1% de progresso. Um seletor
que percorresse `items` para contar assinaria o mapa inteiro e faria a barra repintar
dezenas de vezes por segundo, que é exatamente o que a store existe para evitar.

### 6.3 O texto das landings é gerado, e mesmo assim é diferente em cada uma

Doze páginas escritas à mão divergiriam na primeira correção; doze páginas com o mesmo
texto e o nome trocado são páginas-porta, e buscador ignora com razão. A saída foi gerar o
texto **a partir do que cada formato faz com os pixels** — e isso é de fato diferente por
par:

| Par                  | O que a página promete                                                  |
| -------------------- | ----------------------------------------------------------------------- |
| `jpg-para-png`       | sem perda, e **maior**, porque o JPG já tinha jogado informação fora    |
| `png-para-webp`      | sem perda, e **menor**: −29% numa foto, −78% em arte chapada (medido)   |
| `png-para-avif`      | sem perda, e **maior**, porque o lossless do AVIF não compete com o PNG |
| qualquer `-para-jpg` | **não** é sem perda; qualidade máxima, e a página diz isso              |

A medição que reordenou duas dessas linhas, feita com os codecs de produção sobre 800×600:

| Origem       | PNG    | WebP sem perda | AVIF sem perda |
| ------------ | ------ | -------------- | -------------- |
| foto         | 728 KB | 516 KB (−29%)  | 1058 KB (+45%) |
| arte chapada | 1 KB   | 0,3 KB (−78%)  | 5 KB (+515%)   |

Ou seja: **"AVIF é o mais eficiente" é verdade no modo com perda e falso no sem perda.**
Prometer arquivo menor em `/png-para-avif` teria sido uma mentira medível — a página manda
quem quer economizar espaço para o modo Auto.

### 6.4 Duas armadilhas que o build encontrou

**O chunk da rota dinâmica tem colchetes no nome.** O webpack emite
`_next/static/chunks/app/[conversao]/page-<hash>.js` e o HTML o referencia percent-encoded
(`%5Bconversao%5D`). O `scripts/gerar-sw.mjs` conferia a existência do arquivo com a URL
crua e abortou o build. Corrigido com `decodeURIComponent` na conferência; a URL entra no
precache como está, porque é ela que o navegador pede.

**As doze landings ficaram fora do casco do service worker.** Incluí-las inflava o
precache de 832 KB para 1,4 MB — +68% na primeira visita — para guardar onze páginas que
quem chegou pela home não vai abrir. É a mesma regra dos `.wasm`, aplicada a documentos:
elas entram no cache **quando visitadas**, porque a navegação é rede-primeiro e grava o que
carregou. O casco final ficou em **855 KB**.

### 6.5 Definição de pronto — conferida

- [x] As doze landings existem, com título, `h1` único, canônica e JSON-LD próprios
- [x] O sitemap as inclui, e sai da mesma lista que gera as rotas (teste de unidade)
- [x] Nenhuma é órfã: a home e cada landing apontam para as outras
- [x] O E2E navega numa delas, converte, e confere o cabeçalho do arquivo baixado
- [x] Quem chega com o formato "errado" é avisado, nunca recusado
- [x] `npm run check` verde (389 testes); E2E verde nos três navegadores (115 testes)
- [x] Custo medido: **+946 bytes** com gzip no bundle inicial, e as landings carregam
      exatamente os mesmos 9 scripts da home — nenhum JavaScript novo por página

---

## 7. Incremento 15 — `magick-wasm` (a decisão, agora)

O salto de capacidade: HEIC, RAW (CR2, ARW, DNG), TIFF, PSD, ICO, DICOM na entrada; TIFF,
BMP, ICO, GIF, JXL na saída. **273 formatos, 247 lendo, 190 escrevendo** — medido, não
estimado.

Custo: 13,9 MB de wasm (5,0 com gzip, 3,7 com brotli). Só aceitável sob import dinâmico,
fora do bundle inicial e fora do precache do service worker — a mesma regra do Incremento
3, que a arquitetura já aplica.

Cinco pontos de atrito estão detalhados no [`PLANO-CONVERSAO.md` §5](PLANO-CONVERSAO.md) e
**precisam ser resolvidos antes de integrar**: o `probe` que não lê 247 cabeçalhos, o
orçamento calibrado para quatro formatos, os dois motores convivendo, o bundler que já
trava com wasm multi-thread, e a licença do ImageMagick.

**O que mudou agora que o 14 está no ar:** o argumento do estudo era esperar as landings
para saber se a busca por conversão existe. Elas existem, mas **o site ainda não foi
publicado** — sem deploy não há dado de busca, e sem dado o Incremento 15 seria decidido
pela mesma intuição que o §7 do estudo pedia para evitar. A ordem que isso sugere é
**deploy → observar → decidir o 15**, e não 14 → 15.

Este incremento resolve sozinho a decisão nº 5 do [`HANDOFF.md` §13](HANDOFF.md) — _"TIFF
está fora, não há decoder"_. Passa a haver.

---

## 8. Como reproduzir a medição do `magick-wasm`

Se precisar reconferir os números antes de decidir o Incremento 15 — e a regra da casa é
medir, não confiar:

```bash
mkdir magick-teste && cd magick-teste && npm init -y
npm install @imagemagick/magick-wasm@0.0.41
```

```js
import { readFile } from 'node:fs/promises'
import { initializeImageMagick, Magick } from '@imagemagick/magick-wasm'

await initializeImageMagick(
  await readFile('./node_modules/@imagemagick/magick-wasm/dist/magick.wasm'),
)

const formatos = Magick.supportedFormats
console.log('total:', formatos.length)
console.log('lê:', formatos.filter((f) => f.supportsReading).length)
console.log('escreve:', formatos.filter((f) => f.supportsWriting).length)
```

Faça isso **fora do repositório** — o pacote não deve entrar em `package.json` antes de o
Incremento 15 ser decidido.

---

## 9. Armadilhas desta frente

Somam-se às do [`HANDOFF.md` §12](HANDOFF.md), que continuam valendo.

| Armadilha                             | O que acontece                                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Lista fechada em `preferences.ts`~~ | **Resolvida na estrutura** (§5.5): a lista virou fonte única em `types.ts` e o tipo deriva dela                                                                                   |
| ~~Badge verde com número positivo~~   | **Resolvido** (§5.4): âmbar quando cresce, com o mesmo arredondamento do texto                                                                                                    |
| **"Sem perda" no JPEG**               | JPEG não tem modo sem perda, e nunca terá. O AVIF tem — isso foi medido (§5.3). Prometer o do JPEG na UI é mentira verificável                                                    |
| **`exact: 1` no WebP**                | Tirar a flag "economiza" ~6% de bytes e quebra a promessa nos pixels transparentes. Há teste de integração que cai se alguém tentar                                               |
| **Texto de UI no `getByText` do E2E** | A home tem "Entrada em JPG, PNG, WebP e AVIF" nas landings; um `getByText` largo casa com dois elementos. Escopar pela região resolve                                             |
| **Buffer do `setInputFiles`**         | O teto de 50 MB do Playwright é sobre a transferência em base64, não sobre os bytes. A mensagem de erro não diz isso                                                              |
| **`getByRole('listitem')` amplo**     | A grade "Todas as conversões" é uma `<ul>`: contar itens de lista na página inteira passou a contar os links. Escopar pela região da fila                                         |
| **Chunk com colchete no nome**        | A rota `app/[conversao]` emite um diretório com colchetes, referenciado percent-encoded no HTML. Quem for ler URL do HTML e tocar em disco precisa de `decodeURIComponent` (§6.4) |
| **`magick-wasm` está em 0.0.x**       | API pode mudar entre versões de correção. Fixar versão exata, como o projeto já faz com todas as outras                                                                           |
| **Precache do service worker**        | `scripts/gerar-sw.mjs` exclui `.wasm` **e as landings de par** de propósito (§6.4). Se alguém "consertar" isso, o casco vai de 855 KB para 1,4 MB — e para 14 MB com o `magick`   |
