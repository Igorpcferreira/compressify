# Comparação com o app Electron — critério de aceite #2

> **Gerado por medição**, não escrito à mão:
> `npm run paridade` executa `tests/integration/electron-parity.test.ts` e
> reescreve este arquivo. Qualquer número aqui pode ser reproduzido em um comando.

O brief da Fase 1 exige que o **modo meta** produza resultado equivalente ao do app
desktop, dentro de **±10%**, com o AVIF excluído. Os dois motores são diferentes por
construção — o desktop usa `sharp`/libvips 0.33.5 com processo nativo; a web usa os
codecs WASM do jSquash dentro de um worker — então "equivalente" só significa alguma
coisa se for medido sobre **os mesmos bytes de entrada**.

## Como a medição é feita

1. As fontes são geradas uma vez, pelo próprio `sharp`, a partir dos pixels de
   `synthPhoto` (gradiente, brilho radial, bandas e ruído de alta frequência, com
   semente fixa). Nenhum binário entra no repositório e a entrada não favorece nenhum
   dos dois lados.
2. Os mesmos bytes vão para `tests/helpers/electron-reference.ts` — transcrição
   literal do pipeline de `src/main/index.ts` da tag `v1.0.0-electron`, com o
   `sharp` fixado em **0.33.5**, a versão que o `package-lock.json` daquela tag
   resolveu — e para o `ImageEngine` de produção.
3. Compara-se o tamanho do arquivo de saída.

## Modo meta — o critério

| Fonte              | Saída | Meta   | Electron (sharp 0.33.5) | Web (jSquash WASM)           | Δ          |              |
| ------------------ | ----- | ------ | ----------------------- | ---------------------------- | ---------- | ------------ |
| foto-1600x1200.jpg | webp  | 205 KB | 204.1 KB · 1600×1200    | 203.2 KB · 1600×1200         | **−0.4%**  | ✅           |
| foto-1600x1200.jpg | jpeg  | 307 KB | 297.7 KB · 1600×1200    | 297.7 KB · 1600×1200         | **+0.0%**  | ✅           |
| foto-1200x900.jpg  | webp  | 102 KB | 101.5 KB · 1200×900     | 101.7 KB · 1200×900          | **+0.2%**  | ✅           |
| foto-1200x900.jpg  | jpeg  | 154 KB | 152.4 KB · 1200×900     | 152.4 KB · 1200×900          | **+0.0%**  | ✅           |
| arte-800x600.png   | png   | 256 KB | 255.7 KB · 800×600      | 256.0 KB · 800×600           | **+0.1%**  | ✅           |
| foto-1600x1200.jpg | webp  | 31 KB  | 30.2 KB · 1128×846      | 53.7 KB · 1344×1008 · avisou | **+78.0%** | ⚠️ downscale |

**Maior divergência entre os casos comparáveis: +0.4%** — dentro da banda de
±10%.

### O caso marcado com ⚠️

Quando a meta só é alcançável reduzindo a resolução, os dois produtos divergem por uma
diferença **deliberada**, registrada em [`PLANO.md` §3.3](PLANO.md): o desktop testava o
piso de 900px sobre a escala _atual_, antes de multiplicar, e por isso o piso efetivo
caía para ~756px. A versão web testa as dimensões _resultantes_ e para em 900px de
verdade. O desktop entrega um arquivo menor porque entrega **uma imagem menor** — e
comparar bytes aí seria comparar duas decisões de produto, não dois compressores.

O "avisou" na tabela é o que impede que essa linha seja lida como uma meta estourada em
silêncio: os dois produtos devolvem `status: 'warning'` com a mensagem do limite quando
não alcançam o alvo. Entregar acima da meta sem dizer é exatamente o defeito que
reprovou o `target_size` do libwebp no spike ([`SPIKE.md`](SPIKE.md) §5.4).

O que o teste exige nesse regime é o que continua sendo do algoritmo: que o piso de
900px valha, e que nenhum dos dois entregue acima da meta em silêncio.

## Modo automático — evidência adicional

Fora do critério do brief, mas útil: é o caminho que a maioria dos usuários percorre.

| Fonte              | Saída | Entrada  | Electron | Web      | Δ      |
| ------------------ | ----- | -------- | -------- | -------- | ------ |
| foto-1600x1200.jpg | webp  | 617.6 KB | 513.1 KB | 513.7 KB | +0.1%  |
| foto-1200x900.jpg  | jpeg  | 349.8 KB | 187.9 KB | 188.4 KB | +0.3%  |
| arte-800x600.png   | png   | 963.7 KB | 293.0 KB | 256.0 KB | −12.6% |

No modo automático os dois codificam na **mesma qualidade** pedida, sem busca por
tamanho — então a diferença que aparece aqui é a diferença entre os encoders (mozjpeg
e libwebp compilados para WASM contra os mesmos algoritmos dentro do libvips), e não
entre as estratégias. É por isso que o brief pede a banda no modo meta: lá a estratégia
é que decide o resultado, e é a estratégia que foi portada.

## O que esta medição **não** cobre

- **AVIF**, excluído pelo próprio brief: o `speed: 8` que o spike mediu
  ([`SPIKE.md`](SPIKE.md)) troca compressão por tempo de forma deliberada, e o desktop
  usa `effort: 5`. São dois pontos de operação diferentes, não duas implementações da
  mesma coisa.
- **Tempo de execução.** O desktop roda nativo; a web roda WASM dentro de um worker. A
  comparação de velocidade está no `SPIKE.md` e nunca foi promessa do brief.
- **Qualidade visual.** O critério é de tamanho. Os dois pipelines decodificam,
  redimensionam e codificam com bibliotecas diferentes; nada aqui afirma que os pixels
  são idênticos.
