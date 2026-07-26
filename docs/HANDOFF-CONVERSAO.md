# Handoff da conversão — como começar

> **Este é o documento para abrir uma sessão nova.** Quem retomar a frente de conversão
> de formatos — pessoa ou sessão de IA — lê **este arquivo primeiro**, depois
> [`PLANO-CONVERSAO.md`](PLANO-CONVERSAO.md) (o estudo que justifica as decisões) e só
> então [`HANDOFF.md`](HANDOFF.md) (o estado geral do projeto).
>
> Escrito em 26/07/2026. **O Incremento 13 está feito** (§5) — o modo "Converter" está no
> ar, com 20 testes novos e um E2E nos três navegadores. O próximo é o **Incremento 14**
> (§6). O 15 continua sendo decisão para depois do 14.
>
> **Uma correção ao estudo, medida:** o `@jsquash/avif` 2.1.1 **tem** modo sem perda, e ele
> é bit-exato. A decisão nº 5 do §4 estava errada e foi corrigida onde aparece.

---

## 1. O que colar na sessão nova

Copie o bloco abaixo como primeira mensagem:

```
Vamos continuar o Compressify. Leia docs/HANDOFF-CONVERSAO.md primeiro — ele é o
roteiro desta frente e diz o que já está decidido. Depois leia
docs/PLANO-CONVERSAO.md (o estudo) e docs/HANDOFF.md (o estado do projeto).

Implemente o Incremento 14 — a interface "X para Y", com as landings por par de
formatos. O escopo está no §6 deste arquivo e no §6 do PLANO-CONVERSAO.

Você tem autorização para commitar e dar push sem me perguntar. Rode
`npm run check` e o E2E antes de cada commit.
```

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
npm run check              # 368 testes, ~50 s
npm run build              # exportação estática + service worker
npx playwright install     # uma vez
npm run e2e                # 100 testes em Chromium, Firefox e WebKit
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

## 6. Incremento 14 — a interface "X para Y"

Detalhe completo no [`PLANO-CONVERSAO.md` §6](PLANO-CONVERSAO.md). Em resumo:

- Seletor origem → destino no topo, com busca, no padrão dos prints do Convertio
- Cada par vira landing gerada (`/jpg-para-webp`, `/png-para-avif`…), reusando `ToolPage`
  e `StructuredData` — a máquina de SEO já existe e o sitemap é gerado na build
- **Cuidado:** o seletor de origem filtra a exibição, não o motor. Quem arrastar um PNG
  numa página de "JPG para WebP" não pode ser recusado sem explicação

Ainda sem dependência nova.

---

## 7. Incremento 15 — `magick-wasm` (decidir depois do 14)

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

| Armadilha                             | O que acontece                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Lista fechada em `preferences.ts`~~ | **Resolvida na estrutura** (§5.5): a lista virou fonte única em `types.ts` e o tipo deriva dela                                       |
| ~~Badge verde com número positivo~~   | **Resolvido** (§5.4): âmbar quando cresce, com o mesmo arredondamento do texto                                                        |
| **"Sem perda" no JPEG**               | JPEG não tem modo sem perda, e nunca terá. O AVIF tem — isso foi medido (§5.3). Prometer o do JPEG na UI é mentira verificável        |
| **`exact: 1` no WebP**                | Tirar a flag "economiza" ~6% de bytes e quebra a promessa nos pixels transparentes. Há teste de integração que cai se alguém tentar   |
| **Texto de UI no `getByText` do E2E** | A home tem "Entrada em JPG, PNG, WebP e AVIF" nas landings; um `getByText` largo casa com dois elementos. Escopar pela região resolve |
| **Buffer do `setInputFiles`**         | O teto de 50 MB do Playwright é sobre a transferência em base64, não sobre os bytes. A mensagem de erro não diz isso                  |
| **`magick-wasm` está em 0.0.x**       | API pode mudar entre versões de correção. Fixar versão exata, como o projeto já faz com todas as outras                               |
| **Precache do service worker**        | `scripts/gerar-sw.mjs` exclui `.wasm` de propósito. Se alguém "consertar" isso, o primeiro acesso passa a baixar 14 MB                |
