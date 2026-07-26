/**
 * Os codecs reais, por trás de uma fronteira estreita.
 *
 * Duas regras governam este módulo:
 *
 * 1. **Nada de `import` no topo.** Todo codec entra por `await import()`, e só
 *    quando o job realmente produz aquele formato. O `avif_enc.wasm` sozinho
 *    tem 3,4 MB; se ele entrasse no bundle inicial, a meta de Lighthouse ≥ 90
 *    morria antes de o usuário escolher AVIF (docs/PLANO.md §3.6).
 * 2. **A estratégia não sabe que este módulo existe.** `strategy.ts` recebe uma
 *    função `Renderer`; quem liga uma coisa na outra é o `ImageEngine`.
 *
 * Os parâmetros aqui não são preferências: são pontos de operação medidos no
 * spike. Mudar qualquer um deles sem remedir é desfazer o Incremento 0.
 */

import type { ImageFormat } from '@/engine/core/types'
import type { RgbaImage } from './decode'
import { QUALITY_MAX, QUALITY_MIN } from './strategy'
import { paletteSizeForQuality, quantize, shouldQuantize } from './quantize'

/**
 * AVIF: `speed: 8`, nunca 6.
 *
 * 6,3× mais rápido no Chromium e 6,5× no Firefox (docs/SPIKE.md §5.1). É o
 * parâmetro que torna o AVIF viável no navegador, e é também a razão pela qual
 * o AVIF fica fora da banda de ±10% de fidelidade com o app Electron, que
 * usava o equivalente aproximado de `speed: 6`.
 */
export const AVIF_SPEED = 8

/**
 * oxipng: nível 1, nunca 2.
 *
 * Os dois entregam os mesmos bytes (diferença de 0,07%), e o nível 2 custa 62%
 * mais tempo no Chromium e 118% mais no Firefox (docs/SPIKE.md §5.2).
 */
export const OXIPNG_LEVEL = 1

/** lanczos3 — o padrão do jSquash e o mais próximo do Sharp em nitidez. */
export const RESIZE_METHOD = 'lanczos3' as const

/**
 * O `RgbaImage` do motor é estruturalmente um `ImageData` sem o campo
 * `colorSpace`, que os codecs não leem — eles usam apenas `data`, `width` e
 * `height`. A conversão fica isolada aqui, em vez de espalhar o tipo do DOM
 * pelo motor, para que o pipeline continue construível e testável em Node.
 */
function asImageData(image: RgbaImage): ImageData {
  return image as ImageData
}

/**
 * Cópia independente dos pixels.
 *
 * O quantizador muta in-place e o `ImageData` da escala é reaproveitado entre
 * as tentativas de encode — sem a cópia, a segunda tentativa quantizaria uma
 * imagem já quantizada e a busca binária passaria a comparar maçãs com
 * laranjas.
 */
function cloneImage(image: RgbaImage): RgbaImage {
  return {
    data: new Uint8ClampedArray(image.data),
    width: image.width,
    height: image.height,
  }
}

async function encodeJpeg(image: RgbaImage, quality: number): Promise<ArrayBuffer> {
  // mozjpeg dos dois lados — é o encoder mais fiel ao app desktop.
  const { default: encode } = await import('@jsquash/jpeg/encode')
  return await encode(asImageData(image), { quality })
}

async function encodeWebp(
  image: RgbaImage,
  quality: number,
  lossless: boolean,
): Promise<ArrayBuffer> {
  // Sem `target_size`: medido no spike, ele estoura a meta (513 KB para um
  // alvo de 512 KB). A busca binária do app Electron fica (docs/SPIKE.md §5.4).
  const { default: encode } = await import('@jsquash/webp/encode')

  if (!lossless) return await encode(asImageData(image), { quality })

  // `exact: 1` não é preciosismo, é o que faz o "sem perda" ser verdade em
  // imagem com transparência: sem ele o libwebp descarta o RGB dos pixels
  // totalmente transparentes (medido: 1.664 subpixels diferentes numa imagem
  // de ruído com alfa, contra zero com a flag). Custa ~6% de bytes.
  return await encode(asImageData(image), { lossless: 1, exact: 1 })
}

async function encodeAvif(
  image: RgbaImage,
  quality: number,
  lossless: boolean,
): Promise<ArrayBuffer> {
  const { default: encode } = await import('@jsquash/avif/encode')

  // O `@jsquash/avif` 2.1.1 **tem** modo sem perda, e ele é bit-exato: a flag
  // fixa `quality: 100`, `qualityAlpha: -1` e `subsample: 3` (YUV 4:4:4), e o
  // ida-e-volta sobre ruído RGB puro, com e sem alfa, devolve os mesmos bytes.
  // Medido — o docs/HANDOFF-CONVERSAO.md §4.5 dizia que a flag não existia, e
  // era o único ponto do estudo que a versão instalada desmente.
  if (lossless) return await encode(asImageData(image), { lossless: true, speed: AVIF_SPEED })

  return await encode(asImageData(image), { quality, speed: AVIF_SPEED })
}

/**
 * PNG: quantização própria quando há perda, encode, e otimização lossless.
 *
 * Substitui o `png({ quality, palette: quality < 88 })` do Sharp. O limiar de
 * 88 e a ausência de dithering são do original; o quantizador é nosso porque o
 * `image-q` custava 13,6 s por imagem de 12MP (docs/PLANO.md §3.4).
 */
async function encodePng(
  image: RgbaImage,
  quality: number,
  lossless: boolean,
): Promise<ArrayBuffer> {
  let source = image

  // O PNG é sem perda por definição do formato; o que tira perda dele é o
  // quantizador. No modo converter ele nem é consultado — a qualidade da UI
  // não pode reintroduzir perda onde a promessa é não ter nenhuma.
  if (!lossless && shouldQuantize(quality)) {
    source = cloneImage(image)
    quantize(source.data, source.width, source.height, {
      colors: paletteSizeForQuality(quality),
    })
  }

  const { default: encode } = await import('@jsquash/png/encode')
  const encoded = await encode(asImageData(source))

  // O oxipng é quem converte para paleta indexada ao detectar ≤256 cores —
  // sem ele, a quantização reduziria as cores sem reduzir os bytes.
  const { default: optimise } = await import('@jsquash/oxipng/optimise')
  return await optimise(encoded, { level: OXIPNG_LEVEL })
}

export interface EncodeImageOptions {
  /**
   * Pedido de saída sem perda — o modo converter. É um **pedido**, não uma
   * promessa: o que cada formato faz com ele está na tabela abaixo, e o JPEG
   * simplesmente não tem o que oferecer.
   */
  lossless?: boolean
}

/**
 * Codifica um `RgbaImage` no formato pedido.
 *
 * A qualidade é clampada aqui, na fronteira do encoder, como o `renderBuffer`
 * do app Electron fazia. A estratégia já entrega valores em faixa; isto é a
 * segunda linha de defesa, não a primeira.
 *
 * O que `lossless` significa em cada destino — e a UI diz o mesmo, porque
 * prometer "sem perda" onde não há é mentira verificável:
 *
 * | Destino | O que acontece                    | Sem perda de verdade?      |
 * | ------- | --------------------------------- | -------------------------- |
 * | PNG     | quantizador desligado             | ✅ por definição do formato |
 * | WebP    | `lossless: 1` + `exact: 1`        | ✅ medido, byte a byte      |
 * | AVIF    | `lossless: true` (q100 · YUV444)  | ✅ medido, byte a byte      |
 * | JPEG    | `QUALITY_MAX`                     | ❌ o formato não tem modo sem perda |
 */
export async function encodeImage(
  image: RgbaImage,
  format: ImageFormat,
  quality: number,
  options: EncodeImageOptions = {},
): Promise<Uint8Array> {
  const lossless = options.lossless ?? false
  const clamped = Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, Math.round(quality)))

  switch (format) {
    case 'jpeg':
      // Sem caso de lossless: não existe JPEG sem perda. O melhor que se pode
      // entregar é a qualidade máxima, e é o que a estratégia já pede.
      return new Uint8Array(await encodeJpeg(image, clamped))
    case 'webp':
      return new Uint8Array(await encodeWebp(image, clamped, lossless))
    case 'avif':
      return new Uint8Array(await encodeAvif(image, clamped, lossless))
    case 'png':
      return new Uint8Array(await encodePng(image, clamped, lossless))
  }
}

/**
 * Redimensiona **sempre a partir do original**.
 *
 * Encadear resizes (0,84 sobre o resultado de 0,84) acumula perda de detalhe a
 * cada passo. O `ImageEngine` garante a origem única; este módulo só executa.
 */
export async function resizeImage(
  image: RgbaImage,
  width: number,
  height: number,
): Promise<RgbaImage> {
  const { default: resize } = await import('@jsquash/resize')
  return await resize(asImageData(image), {
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
    method: RESIZE_METHOD,
  })
}
