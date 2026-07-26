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

async function encodeWebp(image: RgbaImage, quality: number): Promise<ArrayBuffer> {
  // Sem `target_size`: medido no spike, ele estoura a meta (513 KB para um
  // alvo de 512 KB). A busca binária do app Electron fica (docs/SPIKE.md §5.4).
  const { default: encode } = await import('@jsquash/webp/encode')
  return await encode(asImageData(image), { quality })
}

async function encodeAvif(image: RgbaImage, quality: number): Promise<ArrayBuffer> {
  const { default: encode } = await import('@jsquash/avif/encode')
  return await encode(asImageData(image), { quality, speed: AVIF_SPEED })
}

/**
 * PNG: quantização própria quando há perda, encode, e otimização lossless.
 *
 * Substitui o `png({ quality, palette: quality < 88 })` do Sharp. O limiar de
 * 88 e a ausência de dithering são do original; o quantizador é nosso porque o
 * `image-q` custava 13,6 s por imagem de 12MP (docs/PLANO.md §3.4).
 */
async function encodePng(image: RgbaImage, quality: number): Promise<ArrayBuffer> {
  let source = image

  if (shouldQuantize(quality)) {
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

/**
 * Codifica um `RgbaImage` no formato pedido.
 *
 * A qualidade é clampada aqui, na fronteira do encoder, como o `renderBuffer`
 * do app Electron fazia. A estratégia já entrega valores em faixa; isto é a
 * segunda linha de defesa, não a primeira.
 */
export async function encodeImage(
  image: RgbaImage,
  format: ImageFormat,
  quality: number,
): Promise<Uint8Array> {
  const clamped = Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, Math.round(quality)))

  switch (format) {
    case 'jpeg':
      return new Uint8Array(await encodeJpeg(image, clamped))
    case 'webp':
      return new Uint8Array(await encodeWebp(image, clamped))
    case 'avif':
      return new Uint8Array(await encodeAvif(image, clamped))
    case 'png':
      return new Uint8Array(await encodePng(image, clamped))
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
