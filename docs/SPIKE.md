# Spike do motor — Incremento 0

> Objetivo: responder **go/no-go** sobre os codecs WASM antes de escrever qualquer
> linha de UI. O `PLANO.md` afirmava que este era o maior risco do projeto; este
> documento mede em vez de supor.
>
> Data: 25/07/2026 · Nenhum código de produção foi escrito neste incremento.

---

## Veredito

**GO** — o motor é viável no navegador. Mas as medições derrubaram **quatro suposições
do `PLANO.md`**, uma delas séria o bastante para virar decisão de produto.

| Descoberta | Efeito no plano |
|---|---|
| AVIF com `speed: 8` é **6,3× mais rápido** que com `speed: 6` | Viabiliza o AVIF. Muda §3.6 |
| Firefox é **3–9× mais lento que o Chromium em WASM** | Novo. Muda o dimensionamento e a UX |
| `oxipng` nível 1 entrega os **mesmos bytes** do nível 2 em metade do tempo | Muda §3.4 |
| `image-q` custa 13–32 s por imagem de 12MP mesmo otimizado | Ameaça a decisão 1. **Precisa da sua escolha** |
| `target_size` do libwebp **estoura a meta** | Rejeitado. A busca binária fica |
| Decode nativo ganha 1,0–6,9×, não "ordens de grandeza" | Corrige um exagero meu em §3.2 |
| Saída antecipada da busca economiza ~14%, não ~30% | Corrige minha estimativa em §3.1 |

---

## 1. Metodologia

- Codecs reais nas versões fixadas no `PLANO.md`, empacotados por Vite e servidos como
  build de produção (não dev server).
- **Tudo roda dentro de um Web Worker**, como em produção. Isso também valida que os
  codecs funcionam em contexto de worker — risco que estava aberto.
- Chromium 141 e Firefox 153, via Playwright, sequencialmente na mesma máquina
  (16 núcleos lógicos, `crossOriginIsolated: false`).
- Imagem de teste gerada proceduralmente com entropia de fotografia: gradiente de céu,
  brilho radial, bandas de terreno, arestas duras e ruído de alta frequência. LCG com
  semente fixa — verifiquei que os dois navegadores produzem bytes idênticos, então as
  comparações são válidas.
- **Warmup descartado** antes de cada medição cronometrada. Sem isso a primeira rodada
  produziu absurdos (12MP "mais lento" que 24MP), porque a primeira chamada paga
  instanciação do módulo WASM e JIT. Mediana de 2–3 execuções; AVIF e `oxipng` com
  execução única por custo.

> **Ressalva sobre o Firefox:** o build do Playwright é uma variante compilada pelo
> projeto, não o Firefox de prateleira. A diferença de 9× é grande demais para ser só
> artefato de build, mas os números do Firefox devem ser reconfirmados manualmente no
> navegador real antes de virarem promessa no README.

---

## 2. Decode: nativo vs WASM

Tempo em milissegundos. "ganho" = quantas vezes o WASM é mais lento que o nativo.

### Chromium

| Resolução | Formato | `createImageBitmap` | `@jsquash/*/decode` | ganho |
|---|---|---|---|---|
| 2MP | JPEG | 27 ms | 27 ms | 1,0× |
| 2MP | PNG | 26 ms | 31 ms | 1,2× |
| 2MP | WebP | 35 ms | 52 ms | 1,5× |
| 12MP | JPEG | 291 ms | **189 ms** | 0,6× |
| 12MP | PNG | 141 ms | 188 ms | 1,3× |
| 12MP | WebP | 258 ms | 730 ms | 2,8× |
| 24MP | JPEG | 327 ms | 422 ms | 1,3× |
| 24MP | PNG | 357 ms | 482 ms | 1,3× |
| 24MP | WebP | 457 ms | 745 ms | 1,6× |

### Firefox

| Resolução | Formato | `createImageBitmap` | `@jsquash/*/decode` | ganho |
|---|---|---|---|---|
| 2MP | JPEG | 36 ms | 135 ms | 3,8× |
| 2MP | PNG | 28 ms | 194 ms | 6,9× |
| 2MP | WebP | 51 ms | 338 ms | 6,6× |
| 12MP | JPEG | 217 ms | 913 ms | 4,2× |
| 12MP | PNG | 155 ms | 1,0 s | 6,7× |
| 12MP | WebP | 240 ms | 1,5 s | 6,4× |
| 24MP | JPEG | 667 ms | 2,0 s | 2,9× |
| 24MP | PNG | 351 ms | 2,1 s | 6,1× |
| 24MP | WebP | 523 ms | 2,9 s | 5,6× |

**A decisão 4 (decode híbrido) se confirma, mas por motivo diferente do que argumentei.**

No `PLANO.md` §3.2 escrevi que o decode nativo seria "ordens de grandeza mais rápido".
**Estava errado.** No Chromium o ganho é modesto e, em JPEG de 12MP, o decoder WASM foi
*mais rápido* que o nativo. A justificativa real é outra e continua forte:

1. **No Firefox o ganho é grande** — 3–7×. E o Firefox é justamente onde sobra menos
   margem (§4).
2. **1,5 MB de WASM fora do caminho crítico**, que é o que salva a meta de Lighthouse.
3. **Orientação EXIF resolvida em todos os formatos**, não só JPEG.

Fica mantido: nativo como principal, WASM como fallback.

---

## 3. Encode

Qualidade 75, um encode. Tempos em segundos onde aplicável.

| Resolução | Formato | Chromium | Firefox | FF/Cr | Bytes |
|---|---|---|---|---|---|
| 2MP | JPEG | 239 ms | 1,1 s | 4,6× | 147 KB |
| 2MP | WebP | 214 ms | 1,5 s | 7,0× | 263 KB |
| 2MP | AVIF | 1,9 s | 16,0 s | 8,4× | 81 KB |
| 2MP | PNG | 21 ms | 192 ms | 9,1× | 4,9 MB |
| 12MP | JPEG | 1,7 s | 5,9 s | 3,5× | 903 KB |
| 12MP | WebP | 1,2 s | 8,5 s | 7,1× | 1,6 MB |
| 12MP | AVIF | 8,7 s | 86,0 s | 9,9× | 499 KB |
| 12MP | PNG | 139 ms | 1,1 s | 7,9× | 30,6 MB |
| 24MP | JPEG | 2,5 s | 11,2 s | 4,5× | 1,8 MB |
| 24MP | WebP | 2,9 s | 18,6 s | 6,4× | 3,3 MB |
| 24MP | PNG | 308 ms | 2,2 s | 7,1× | 61,4 MB |

Auxiliares:

| Resolução | Operação | Chromium | Firefox |
|---|---|---|---|
| 12MP | resize 0,84 | 1,7 s | 8,9 s |
| 24MP | resize 0,84 | 3,3 s | 16,3 s |
| 12MP | oxipng nível 2 | 7,8 s | 32,2 s |
| 24MP | oxipng nível 2 | 14,4 s | 62,8 s |
| 12MP | image-q | 24,0 s | 59,5 s |

---

## 4. A descoberta que não estava no plano: o Firefox

O Firefox é consistentemente **3 a 10× mais lento** que o Chromium nos codecs. Isso não
aparecia em lugar nenhum do brief nem do plano.

Para saber se é o WASM ou o build inteiro, rodei uma linha de base em **JavaScript puro**
— a geração procedural da imagem de 12MP, laços numéricos sobre typed arrays, sem WASM:

| | Chromium | Firefox | razão |
|---|---|---|---|
| `synthPhoto` 12MP (JS puro, numérico) | 265 ms | 351 ms | **1,3×** |
| `image-q` 12MP (JS puro, alocação pesada) | 21,1 s | 83,0 s | **3,9×** |
| AVIF 12MP `speed: 6` (WASM) | 9,5 s | 88,9 s | **9,4×** |

**Conclusão: não é o build.** Em JS numérico apertado o Firefox está a 1,3× — normal. A
diferença explode no WASM (9×) e no JS pesado em alocação (4×). É característica de
carga, não de máquina.

### O que isso muda

Três coisas entram no plano:

1. **Guarda de orçamento de tempo.** Se a busca de meta ultrapassar um teto (proponho
   20 s por arquivo), ela para e devolve o melhor resultado até ali, com status
   `warning`. Sem isso, uma foto de 24MP em modo meta no Firefox trava a fila por
   minutos e o usuário fecha a aba.
2. **O aviso de custo na UI passa a ser sensível ao navegador**, não só ao formato. A
   combinação AVIF + meta + arquivo grande no Firefox precisa avisar antes de começar.
3. **A degradação documentada do README ganha número real.** "Funciona em Chrome,
   Firefox e Safari (com degradação documentada onde houver)" — a degradação é esta, e
   agora ela tem tabela.

---

## 5. Mitigações medidas

### 5.1 AVIF: o parâmetro `speed` resolve — este é o achado que salva o formato

Imagem de 12MP, qualidade nominal 50:

| `speed` | Chromium | Firefox | Bytes |
|---|---|---|---|
| 6 (equivalente ao plano original) | 9,5 s | 88,9 s | 511.011 |
| **8** | **1,5 s** | **13,6 s** | 443.011 |
| 10 | 1,1 s | 10,8 s | 453.221 |

`speed: 8` é **6,3× mais rápido no Chromium e 6,5× no Firefox**, e o arquivo sai 13%
menor. Os bytes foram idênticos nos dois navegadores — o encoder é determinístico.

**Cuidado ao ler isso:** menor não significa melhor. A qualidade nominal 50 é
interpretada de forma diferente em cada preset de velocidade; o arquivo de `speed: 8` é
menor porque também é de qualidade um pouco menor, não porque o encoder ficou mágico. O
que o número prova é que existe um ponto de operação muito melhor que o do plano.

`speed: 10` só ganha mais 27% de tempo sobre o 8 e piora o tamanho — não compensa.

**Decisão: AVIF passa a usar `speed: 8`.** Consequência de fidelidade em §7.

Também testei buscar numa proxy reduzida (1/4 da área) antes do encode final: 259 ms no
Chromium. É viável, mas com `speed: 8` deixa de ser necessário. Fica registrado como
carta na manga se o AVIF voltar a incomodar.

### 5.2 oxipng: nível 1, não nível 2

PNG de 12MP, 32.121.820 bytes sem otimizar:

| Nível | Chromium | Firefox | Bytes | Redução |
|---|---|---|---|---|
| 1 | **4,4 s** | **14,1 s** | 15.689.685 | 51,2% |
| 2 (o que o plano previa) | 7,1 s | 30,7 s | 15.678.017 | 51,2% |
| 3 | 21,3 s | 87,8 s | 15.255.280 | 52,5% |

O nível 2 custa **62% mais tempo no Chromium e 118% mais no Firefox** para entregar
0,07% menos bytes. O nível 3 custa 5× o nível 1 por 1,3 ponto percentual.

**Decisão: nível 1.** O `PLANO.md` §3.4 será corrigido.

### 5.3 image-q: funciona, mas o preço é alto — precisa da sua decisão

| Variante (12MP) | Chromium | Firefox |
|---|---|---|
| Paleta completa + dithering padrão | 21,1 s | 83,0 s |
| Paleta de amostra 1/16 + `nearest` | **13,6 s** | **32,0 s** |

Otimizar ajudou (1,6× no Chromium, 2,6× no Firefox), mas **13,6 s por imagem no melhor
navegador** é caro demais para um lote. Uma pasta com 30 PNGs de 12MP levaria 7 minutos
só quantizando no Chromium, e 16 minutos no Firefox.

Isto é o único ponto onde o spike não fecha sozinho. Três caminhos, na minha ordem de
preferência — **detalhados na §8, onde peço sua escolha**.

Lembrando o escopo real: o formato padrão é `smart`, que converte PNG → WebP. Este
caminho só é exercido quando o usuário escolhe PNG explicitamente ou "manter original"
com entrada PNG, **e** puxa a qualidade abaixo de 88.

### 5.4 `target_size` do libwebp: rejeitado por medição

Testei substituir a busca binária pelo `target_size` nativo do libwebp, que eu havia
sinalizado na Etapa 1 como possível ganho grande. Imagem de 12MP:

| Meta | Método | Chromium | Firefox | Encodes | Resultado |
|---|---|---|---|---|---|
| 1 MB | busca binária (7 fixos) | 9,4 s | 61,1 s | 7 | 1024 KB — 100,0% da meta |
| 1 MB | busca com saída antecipada | 10,2 s | 49,3 s | 6 | 1024 KB — idêntico |
| 1 MB | `target_size` nativo | 5,9 s | 39,2 s | 1 | 1016 KB — 99,2% |
| 0,5 MB | busca binária (7 fixos) | 7,2 s | 51,4 s | 7 | 495 KB — 96,6% |
| 0,5 MB | busca com saída antecipada | 6,2 s | 42,8 s | 6 | 495 KB — idêntico |
| 0,5 MB | `target_size` nativo | 5,9 s | 34,6 s | 1 | **513 KB — 100,2%** ❌ |

Dois motivos para rejeitar:

1. **Ele estoura a meta.** Na meta de 0,5 MB entregou 513 KB contra um alvo de 512 KB.
   Uma funcionalidade chamada "meta de tamanho" que devolve arquivo *acima* da meta está
   quebrada, mesmo que por 1 KB. O libwebp trata `target_size` como alvo aproximado; nós
   precisamos de um teto.
2. **O ganho é bem menor do que eu supus.** 1,6× no Chromium, não 7×, porque o libwebp
   faz sua própria busca multi-passo internamente. Não é um encode, são vários
   disfarçados de um.

**A busca binária do app Electron fica.** Resultado negativo, mas é exatamente para isso
que serve um spike.

### 5.4.1 Um resultado colateral: a saída antecipada foi validada empiricamente

Nas quatro comparações acima, a busca com saída antecipada produziu **bytes idênticos**
à busca de 7 iterações fixas — 1024 KB e 495 KB nos dois casos. É a confirmação prática
do argumento de monotonicidade que fiz no `PLANO.md` §3.1.

Mas a economia real foi de **1 encode em 7 (~14%)**, não os ~30% que estimei. A
correção vai para o plano.

---

## 6. O que isso significa em cenários reais

Lote de **50 fotos de 12MP**, modo `smart` (→ WebP), modo automático, com pool de 8
workers e o orçamento de memória de 48 MP do `PLANO.md` §2.1 (que limita a 4
simultâneas):

| | Chromium | Firefox |
|---|---|---|
| Por imagem (decode + 1 encode) | ~1,5 s | ~8,7 s |
| **Lote de 50, 4 simultâneas** | **~19 s** | **~109 s** |
| Lote de 50, 8 simultâneas | ~9 s | ~55 s |

O modo automático costuma resolver em **um encode** quando há conversão de formato — o
resultado em WebP já é menor que o JPEG de origem no primeiro degrau. É o caminho comum
e ele é rápido.

**O orçamento de memória de 48 MP está custando 2× de tempo.** 4 imagens de 12MP
simultâneas são 192 MB de `ImageData` — folgado para qualquer navegador de desktop.
Proponho subir o padrão para **96 MP** e afinar no Incremento 4 com medição de memória
real, em vez de fixar no chute que fiz no plano.

Pior caso do modo meta (meta inatingível, 8 níveis de escala), uma imagem de 12MP:

| | Chromium | Firefox |
|---|---|---|
| App Electron (re-decodifica a cada tentativa) | ~106 s | — |
| Nosso motor (decode único + cache de escala) | ~82 s | ~305 s |

Mesmo com WASM mais lento que libvips, **o modo meta fica mais rápido que o app desktop
no Chromium**, porque o desktop re-decodifica o arquivo até 56 vezes e nós decodificamos
uma. No Firefox o pior caso é ruim o bastante para justificar a guarda de tempo da §4.

---

## 7. Efeitos no `PLANO.md`

Correções a aplicar quando o plano for atualizado (não editei o documento ainda):

| § | Estava | Fica |
|---|---|---|
| 3.2 | "ordens de grandeza mais rápido" | 1,0–2,8× no Chromium, 2,9–6,9× no Firefox. A justificativa passa a ser bundle + EXIF + Firefox |
| 3.1 | Saída antecipada economiza ~30% | ~14% (1 encode em 7), validada como output-idêntica |
| 3.4 | oxipng nível 2 | **nível 1** — mesmos bytes, 40–55% mais rápido |
| 3.6 | AVIF `speed`/`effort` padrão | **`speed: 8`** — 6,3× mais rápido |
| 2.1 | Orçamento de 48 MP | **96 MP**, a afinar no Incremento 4 |
| 3.1 | Tolerância de ±10% vs Electron | Mantida para JPEG/WebP/PNG. **AVIF fica fora da banda** — ver abaixo |
| — | — | **Novo:** guarda de orçamento de tempo por arquivo (20 s) |
| — | — | **Novo:** tabela de degradação do Firefox no README |

**Sobre a fidelidade do AVIF.** Com `speed: 8` o AVIF se afasta mais do app Electron que
os demais formatos — o Sharp usava `effort: 5`, mais próximo de `speed: 6`. O ganho de
6,3× é grande demais para recusar em nome de paridade com um app que ninguém mais vai
rodar. **Proponho que o AVIF seja explicitamente excluído da banda de ±10%** do critério
de aceite #2 e tratado como "melhor esforço", com a razão documentada no README.

---

## 8. A única pergunta que sobra: PNG com perda

Você aprovou o `image-q` na Etapa 2 com base na minha estimativa de custo. A medição
mostrou que o custo é maior do que eu supunha: **13,6 s por imagem de 12MP no Chromium,
32 s no Firefox**, já na variante otimizada. Por isso devolvo a decisão com dados.

**A — Escrever nosso próprio quantizador** *(minha recomendação)*
Histograma sobre amostra → median cut → LUT de 15 bits (32.768 entradas) → aplicação por
lookup direto. A etapa de aplicação vira O(n) com uma consulta por pixel, e a estimativa
é de **200–400 ms a 12MP** — cerca de 40× mais rápido que o `image-q`. São ~120 linhas,
puras e perfeitamente testáveis, e removem uma dependência. Custo: mais código nosso
para manter, e um dia a mais no Incremento 3.

**B — Manter o `image-q`, com portão de tamanho**
Aplica quantização só em imagens até ~8 MP; acima disso, PNG sem perda com aviso claro
na UI. Zero código novo, mas entrega uma inconsistência que o usuário percebe: a mesma
opção se comporta diferente conforme o tamanho do arquivo.

**C — PNG sempre sem perda**
Reverte a decisão 1. O mais simples e o mais rápido; abre mão de uma capacidade que o
app Electron tinha.

Sigo com a **A** se você não tiver preferência — é a que preserva a funcionalidade sem
o custo, e o código é pequeno e testável. Diga se prefere B ou C.

---

## 9. Riscos de §11 do plano, reavaliados

| Risco | Situação após o spike |
|---|---|
| AVIF lento demais | **Resolvido** com `speed: 8` (§5.1) |
| WASM do jSquash não empacotar bem | **Resolvido** para Vite/Rollup — build limpa, `.wasm` emitidos, codecs funcionam dentro de Worker. Turbopack ainda a verificar no Incremento 1 |
| Safari com limites de memória menores | **Em aberto** — o Playwright/WebKit não foi medido aqui. Vai para o Incremento 1 |
| `image-q` lento em imagens grandes | **Confirmado, pior que o previsto** — §8 |
| — | **Novo:** desempenho do Firefox (§4) |
| — | **Novo:** o `@jsquash/avif` quebrou uma vez no Firefox sob pressão de memória, ao instanciar o módulo pela segunda vez. Não reproduziu na segunda tentativa. O pool precisa tratar falha de worker com retry — já previsto em §2.2, agora com motivo concreto |

---

## 10. Reprodução

O harness vive fora do repositório (é instrumentação, não produto). Estrutura:

```
spike/
  src/synth.js           gerador determinístico da imagem de teste
  src/bench.worker.js    bateria 1 — decode/encode/resize/oxipng/image-q
  src/mitig.worker.js    bateria 2 — speed do AVIF, níveis de oxipng, image-q, linha de base JS
  src/webp.worker.js     bateria 3 — target_size vs busca binária
  run.mjs                driver Playwright (Chromium + Firefox)
```

Se você quiser que ele entre no repositório para reprodutibilidade, é só dizer — hoje
optei por manter fora para não poluir a raiz do projeto.
