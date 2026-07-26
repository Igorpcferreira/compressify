# Handoff — estado do projeto e o que vem a seguir

> Documento de continuidade. Quem retomar o Compressify (pessoa ou sessão nova de
> IA) deve ler **este arquivo primeiro** e só então mergulhar no `PLANO.md`.
>
> Última atualização: 25/07/2026, ao fim do Incremento 2.

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
   pode estar defasada. Isso já pegou três armadilhas reais (§5).
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
```

| Incremento                                   | Estado                                |
| -------------------------------------------- | ------------------------------------- |
| 0 — Spike do motor                           | ✅ concluído · [`SPIKE.md`](SPIKE.md) |
| 1 — Fundação                                 | ✅ concluído                          |
| 2 — Algoritmo puro + testes                  | ✅ concluído · 108 testes             |
| **3 — Motor de imagem real**                 | ⬅️ **próximo**                        |
| 4 — Worker, pool, cancelamento               | pendente                              |
| 5 — Store, fila e UI                         | pendente                              |
| 6 — Saída: download, ZIP, File System Access | pendente                              |
| 7 — Acabamento: SEO, modo escuro, a11y, E2E  | pendente                              |
| 8 — Documentação e ícones                    | pendente                              |

`npm run check` (typecheck + lint + formatação + testes) passa limpo. `npm run build`
gera exportação estática sem nenhuma serverless function.

### O que já existe em código

```
app/
  layout.tsx          fontes via next/font (auto-hospedadas), metadata, ThemeScript
  page.tsx            PLACEHOLDER do Incremento 1 — será substituído no 5
  globals.css         design system inteiro em @theme + camada semântica de tema
src/
  components/theme/ThemeScript.tsx     resolve o tema antes da primeira pintura
  engine/core/types.ts                 contratos (CompressionEngine, JobResult…)
  engine/image/strategy.ts             ★ o algoritmo portado — núcleo do projeto
  engine/image/quantize.ts             ★ quantizador próprio (median cut + LUT)
  engine/image/format.ts               smart/original → formato concreto
  engine/image/naming.ts               sufixo -compressify, colisões, caminho relativo
  lib/format.ts                        formatBytes/formatPercent em pt-BR
tests/unit/                            108 testes
docs/                                  PLANO, SPIKE, HANDOFF, brand/
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
| Quantizador próprio                               | 22 ms (2MP) · 96 ms (12MP) · 216 ms (24MP)                  |
| Encode WebP 12MP q75                              | 1,2 s Chromium · 8,5 s Firefox                              |
| Lote de 50 fotos 12MP, modo auto                  | ~9 s Chromium · ~55 s Firefox                               |

O harness do spike **não está no repositório** (é instrumentação, não produto). Se
precisar remedir, a estrutura está descrita em `SPIKE.md` §10.

---

## 4. Próximo incremento — 3, motor de imagem real

Objetivo: `ImageEngine` implementando `CompressionEngine`, ligando os codecs reais ao
`strategy.ts` que já existe e já está testado.

### Arquivos a criar

```
src/engine/image/decode.ts      decode híbrido: nativo primeiro, jSquash de fallback
src/engine/image/codecs.ts      encode por formato, com carregamento sob demanda
src/engine/image/engine.ts      ImageEngine: supports / probe / process
src/engine/core/registry.ts     resolve o motor por arquivo
tests/unit/engine.test.ts       com codecs mockados
```

### Dependências a adicionar

Ainda **não** estão no `package.json` — foram deixadas para este incremento de
propósito. Versões já verificadas:

```
@jsquash/jpeg   1.6.0
@jsquash/png    3.1.1
@jsquash/webp   1.5.0
@jsquash/avif   2.1.1
@jsquash/resize 2.1.1
@jsquash/oxipng 2.3.0
```

### Decisões já tomadas, é só implementar

- **Decode:** `createImageBitmap(blob, { imageOrientation: 'from-image' })` →
  `OffscreenCanvas` → `getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })`
  → `getImageData()`. Fallback para `@jsquash/*/decode` quando lançar. PNG de 16 bits
  vai direto ao fallback (o canvas rebaixa para 8).
- **Encode por formato:**
  - JPEG: `@jsquash/jpeg`, `{ quality }` — mozjpeg dos dois lados, é o mais fiel
  - WebP: `@jsquash/webp`, `{ quality }` — **não** usar `target_size`
  - AVIF: `@jsquash/avif`, `{ quality, speed: 8 }`
  - PNG: se `shouldQuantize(quality)` → `quantize(...)` com
    `paletteSizeForQuality(quality)` → `@jsquash/png` → `optimise(..., { level: 1 })`
- **Resize:** `@jsquash/resize` com `lanczos3` (padrão), a partir **sempre do
  `ImageData` original**, nunca encadeando resizes — encadear degrada a qualidade.
  Cachear o resultado por nível de escala: no pior caso são 8 resizes, não 56.
- **Decodificar uma única vez** por job e reaproveitar. É o que faz o modo meta ficar
  mais rápido que o app desktop.
- **Carregamento sob demanda:** o `avif_enc.wasm` tem 3,4 MB e só pode ser buscado
  quando o job realmente produzir AVIF. `await import()` dentro do encoder, nunca no
  topo do módulo. Isso é requisito do Lighthouse ≥ 90.

### Cuidados

- O `@jsquash/avif` **quebrou uma vez no Firefox** ao instanciar o módulo pela segunda
  vez sob pressão de memória, e não reproduziu. Não tratar aqui — o retry é
  responsabilidade do pool (Incremento 4).
- Liberar buffers agressivamente: `bitmap.close()` depois do `getImageData`, e não
  segurar referências a `ImageData` de escalas que já não serão usadas.
- Verificar se o **Turbopack** empacota os `.wasm` corretamente. Com Vite/Rollup
  funciona (validado no spike). Se falhar, o plano B é copiar os `.wasm` para `/public`
  e usar o `init(url)` que os pacotes expõem.

### Definição de pronto

`ImageEngine.process()` comprime um arquivo real de ponta a ponta, com progresso e
cancelamento funcionando, e `npm run check` passa.

---

## 5. Armadilhas já encontradas — não repetir

| Armadilha                    | O que aconteceu                                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript 7**             | É o `latest` do npm, mas `typescript-eslint` declara peer `<6.1.0`. **Usar 6.0.3.**                                                                                   |
| **ESLint 10**                | `eslint-config-next@16` embute `eslint-plugin-react@7.37.5`, cujo peer vai só até `^9.7`. Quebra em runtime. **Usar 9.39.5.**                                         |
| **lucide-react 1.x**         | Removeu os aliases depreciados. `Loader2`→`LoaderCircle`, `CheckCircle2`→`CircleCheckBig`, `AlertTriangle`→`TriangleAlert`, `XCircle`→`CircleX`, `ImageIcon`→`Image`. |
| **`next.config.ts`**         | O Next 16 removeu a chave `eslint`. Usá-la quebra o typecheck.                                                                                                        |
| **npm global**               | Aponta para um registry privado nesta máquina. Já resolvido pelo `.npmrc` do projeto.                                                                                 |
| **Medição sem warmup**       | A primeira rodada do spike deu 12MP "mais lento" que 24MP. Sempre descartar a primeira execução.                                                                      |
| **Benchmark do quantizador** | Pedir 256 cores numa imagem com menos de 256 baldes ocupados cai no atalho e **não mede** o caminho real. Medir com 64.                                               |

---

## 6. Decisões de produto que já foram fechadas com o Igor

Não reabrir sem motivo novo:

1. **PNG com perda:** quantizador próprio, não `image-q` (opção A, validada em 96 ms).
2. **Design system é ajustável** quando reprova em acessibilidade. As três emendas
   estão implementadas e rastreadas em [`brand/DESVIOS.md`](brand/DESVIOS.md).
3. **Piso de 900px:** corrigido para o contrato documentado (o Electron deixava cair
   para ~756px).
4. **Decode híbrido:** nativo primeiro, WASM de fallback.
5. **TIFF está fora.** Não há decoder e os navegadores não decodificam (só o Safari).
   A UI deve dar erro explicativo, não falhar em silêncio.
6. **OPFS fica para a Fase 3.** `Blob` já é respaldado em disco pelos navegadores.
7. **AVIF fora da banda de ±10%** do critério de aceite #2 — tratado como melhor
   esforço por causa do `speed: 8`.
8. **Sem telemetria, sem analytics, sem script de terceiros.** As fontes são
   auto-hospedadas pelo `next/font` justamente por isso.

---

## 7. Riscos ainda abertos

| Risco                                                          | Onde resolver     |
| -------------------------------------------------------------- | ----------------- |
| Turbopack pode não empacotar os `.wasm` como o Vite empacota   | Incremento 3      |
| Safari/WebKit não foi medido no spike                          | Incremento 3 ou 7 |
| Orçamento de 96 MP em voo é estimativa, não medição            | Incremento 4      |
| Firefox lento pode exigir ajuste do teto de 20 s por job       | Incremento 4      |
| Lighthouse ≥ 90 depende de o AVIF ficar fora do bundle inicial | Incremento 7      |

---

## 8. Critérios de aceite da Fase 1 — rastreamento

Do brief original, com o estado de cada um:

- [ ] 50 imagens em paralelo com progresso individual — Incrementos 4 e 5
- [ ] Modo meta equivalente ao Electron (±10%, AVIF excluído) — Incremento 3, fixtures no 7
- [ ] Nenhuma requisição carregando conteúdo do usuário — `privacy.spec.ts`, Incremento 7
- [ ] A aba não trava — arquitetura já garante (pool + Zustand); verificar no 5
- [ ] Cancelar a fila no meio — Incremento 4
- [ ] Baixar tudo em ZIP — Incremento 6
- [ ] Chrome, Firefox e Safari com degradação documentada — Incremento 7
- [ ] Lighthouse > 90 em Performance e Acessibilidade — Incremento 7
- [x] `npm run check` passa limpo
- [ ] Modo claro e escuro completos — tokens prontos, aplicação nos Incrementos 5 e 7

---

## 9. Como retomar

```bash
cd Compressify
npm install          # o .npmrc já força o registry público
npm run check        # deve passar limpo
npm run dev          # http://localhost:3000
```

Ordem de leitura para quem chega: este arquivo → `PLANO.md` §3 (as decisões do motor)
→ `SPIKE.md` §5 (as mitigações medidas) → `src/engine/image/strategy.ts`.

O comentário no topo do `strategy.ts` explica por que ele não importa nada — essa
separação é o que sustenta a testabilidade do projeto inteiro e não deve ser
quebrada quando o Incremento 3 ligar os codecs.
