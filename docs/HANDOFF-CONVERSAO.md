# Handoff da conversão — como começar

> **Este é o documento para abrir uma sessão nova.** Quem retomar a frente de conversão
> de formatos — pessoa ou sessão de IA — lê **este arquivo primeiro**, depois
> [`PLANO-CONVERSAO.md`](PLANO-CONVERSAO.md) (o estudo que justifica as decisões) e só
> então [`HANDOFF.md`](HANDOFF.md) (o estado geral do projeto).
>
> Escrito em 26/07/2026. Nada da frente de conversão foi implementado ainda — o que
> existe é a decisão de fazer, o estudo que a sustenta e este roteiro.

---

## 1. O que colar na sessão nova

Copie o bloco abaixo como primeira mensagem:

```
Vamos continuar o Compressify. Leia docs/HANDOFF-CONVERSAO.md primeiro — ele é o
roteiro desta frente e diz o que já está decidido. Depois leia
docs/PLANO-CONVERSAO.md (o estudo) e docs/HANDOFF.md (o estado do projeto).

Implemente o Incremento 13 — o modo "Converter", sem comprimir. O escopo, as
decisões já tomadas e a definição de pronto estão no §5 do HANDOFF-CONVERSAO.

Você tem autorização para commitar e dar push sem me perguntar. Rode
`npm run check` e o E2E antes de cada commit.
```

Se quiser ir além do Incremento 13 na mesma sessão, troque a segunda frase por
_"Implemente os Incrementos 13 e 14"_ — mas peça para parar e mostrar entre um e outro.

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
npm run check              # 348 testes, ~50 s
npm run build              # exportação estática + service worker
npx playwright install     # uma vez
npm run e2e                # 97 testes em Chromium, Firefox e WebKit
npm run dev                # http://localhost:3000
```

Último commit da frente principal: `03c51cd`. A Fase 1 está fechada com os 10 critérios
de aceite medidos; sete dos oito itens do [`ROADMAP.md`](ROADMAP.md) foram feitos. O que
falta fora desta frente é **o deploy**, que é decisão do Igor.

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
5. **AVIF não tem lossless real aqui.** O `@jsquash/avif` não expõe a flag; `quality: 100`
   com 4:4:4 é visualmente sem perda, não bit-exato. A UI não pode chamar isso de "sem
   perda" — ver §5.3.

---

## 5. Incremento 13 — o modo "Converter"

**O objetivo:** mudar o formato do arquivo sem passar pela busca de compressão. Um decode,
um encode, no melhor ponto que o formato de destino permite.

**Sem dependência nova.** Só os quatro formatos que já existem.

### 5.1 O que muda, arquivo por arquivo

| Arquivo                                 | Mudança                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/engine/core/types.ts`              | `CompressionMode` ganha `'convert'`                                                 |
| `src/engine/image/strategy.ts`          | `renderConvert()` — um encode, sem busca                                            |
| `src/engine/image/codecs.ts`            | `encodeImage` aceita `{ lossless }`; WebP usa `lossless: 1`, PNG pula o quantizador |
| `src/engine/image/engine.ts`            | Roteia para `renderConvert` quando `mode === 'convert'`                             |
| `src/lib/preferences.ts`                | **`MODES` precisa incluir `'convert'`** — §5.5                                      |
| `src/components/queue/OptionsPanel.tsx` | Terceiro botão no `SegmentedControl` de modo                                        |
| `src/components/queue/FileCard.tsx`     | Badge de economia negativa não pode ser verde — §5.4                                |

### 5.2 A estratégia

`strategy.ts` é puro e não importa nada. A função nova segue a forma das outras duas:

```ts
export async function renderConvert(
  render: Renderer,
  options: { quality: number },
  ctx?: StrategyContext,
): Promise<RenderOutcome>
```

Um `render({ quality, scale: 1 })`, e pronto. Sem escada, sem busca binária, sem
downscale. `encodes: 1`.

O `RenderOutcome` já tem `warning`; use-o quando o resultado ficar maior que o original —
o `ImageEngine` já converte `warning` em `status: 'warning'` e o card já mostra a mensagem.

### 5.3 O que "sem comprimir" significa em cada formato

Isto é o coração do incremento, e cada linha foi verificada nos tipos dos encoders:

| Destino  | O que fazer                                                  | É sem perda de verdade?              |
| -------- | ------------------------------------------------------------ | ------------------------------------ |
| **PNG**  | Pular o quantizador (`shouldQuantize` já usa o limiar de 88) | ✅ Sim, por definição do formato     |
| **WebP** | `lossless: 1` — o `webp_enc.d.ts` expõe, hoje não usamos     | ✅ Sim                               |
| **AVIF** | `quality: 100`; investigar `subsample` para 4:4:4            | ⚠️ **Não** — não há flag de lossless |
| **JPEG** | `quality: 95` (o `QUALITY_MAX`)                              | ❌ **Não existe JPEG sem perda**     |

**A UI precisa dizer isso.** Chamar a saída JPEG de "sem perda" seria mentira. Sugestão de
texto no painel, em modo converter: _"PNG e WebP saem sem perda nenhuma. JPEG e AVIF não
têm modo sem perda — saem na qualidade máxima."_

### 5.4 O aviso que o produto precisa dar

Converter um JPEG para PNG sem perda produz um arquivo **maior**. Medido no estudo:
0,76 MB de JPEG viram 2,23 MB de PNG. Está correto — o PNG guarda os pixels que o JPEG
jogou fora — mas sem explicação lê como defeito.

Duas coisas:

1. **A mensagem.** `ENGINE_MESSAGES.largerThanOriginal` já existe e já é disparada quando
   `savedBytes < 0`. Em modo converter ela deveria ser mais específica: algo como _"O
   formato de destino guarda mais informação que a origem."_
2. **A cor do badge.** `formatSavedPercent` já devolve `+180%` para economia negativa —
   isso está certo e testado. Mas o `FileCard` pinta o badge com `bg-signal` (verde)
   **sempre**. Um "+180%" verde é a interface mentindo com CSS. O badge precisa seguir o
   sinal.

### 5.5 A armadilha que nenhum teste pega

`src/lib/preferences.ts` valida o que vem do `localStorage` campo a campo, contra listas
fechadas:

```ts
const MODES: readonly CompressionMode[] = ['auto', 'target']
```

Se você adicionar `'convert'` ao tipo e esquecer desta lista, o TypeScript **não reclama**
(a lista é um subconjunto válido do tipo) e nenhum teste existente falha. O sintoma
aparece só em uso real: o usuário escolhe "Converter", fecha a aba, volta, e o painel
está em "Auto" de novo — porque a validação silenciosamente rejeitou o valor guardado.

**Acrescente um teste** que percorra todos os valores de `CompressionMode` e verifique que
`sanitizeOptions` preserva cada um. Assim a próxima adição não cai no mesmo buraco.

### 5.6 Definição de pronto

- [ ] Um PNG vira WebP **sem perda**, volta a PNG, e os pixels batem byte a byte
- [ ] Um JPEG vira PNG e o card avisa que ficou maior, com o badge **não verde**
- [ ] A preferência "Converter" sobrevive ao recarregamento (§5.5)
- [ ] O painel explica o que acontece em cada formato de destino
- [ ] `npm run check` verde; E2E verde nos três navegadores
- [ ] Nenhum byte a mais no bundle inicial — o incremento não adiciona dependência

### 5.7 Testes esperados

- **Unidade** (`strategy.test.ts`): `renderConvert` faz exatamente um encode, não
  redimensiona, e propaga o aviso quando o resultado é maior.
- **Integração** (`engine-codecs.test.ts` ou arquivo novo): com os codecs reais, PNG →
  WebP lossless → PNG devolve os mesmos pixels. É o teste que prova a promessa.
- **Store** (`queue-store.test.ts`): o modo converter chega ao orquestrador.
- **E2E**: converter no navegador e conferir o cabeçalho do arquivo baixado.

### 5.8 Mensagem de commit sugerida

```
feat(converter): mudar o formato sem comprimir

Terceiro modo, ao lado de auto e meta. Um decode, um encode, sem escada de
qualidade e sem busca binária — o que o usuário pede quando quer trocar o
formato e não mexer na imagem.

"Sem comprimir" significa coisas diferentes em cada destino, e a interface
diz qual: PNG e WebP saem sem perda de verdade (o WebP tem lossless no
encoder e nós nunca tínhamos usado); JPEG não tem modo sem perda e sai na
qualidade máxima; o AVIF do jSquash não expõe a flag de lossless, então
"máxima" é o que dá para prometer.

Converter um JPEG para PNG produz arquivo maior — 0,76 MB viram 2,23 MB na
medição. Está correto, o PNG guarda o que o JPEG jogou fora, mas sem
explicação lê como defeito. O card passa a dizer por quê, e o badge deixa
de ser verde quando o número é positivo: um "+180%" em verde é a interface
mentindo com CSS.
```

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

| Armadilha                             | O que acontece                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Lista fechada em `preferences.ts`** | Adicionar um valor ao tipo `CompressionMode` sem adicioná-lo a `MODES` faz a preferência ser rejeitada em silêncio (§5.5) |
| **Badge verde com número positivo**   | `formatSavedPercent` já devolve `+180%` corretamente; quem mente é a cor fixa `bg-signal` do `FileCard` (§5.4)            |
| **"Sem perda" no JPEG e no AVIF**     | JPEG não tem. O AVIF do jSquash não expõe a flag. Prometer isso na UI é mentira verificável                               |
| **`magick-wasm` está em 0.0.x**       | API pode mudar entre versões de correção. Fixar versão exata, como o projeto já faz com todas as outras                   |
| **Precache do service worker**        | `scripts/gerar-sw.mjs` exclui `.wasm` de propósito. Se alguém "consertar" isso, o primeiro acesso passa a baixar 14 MB    |
