/**
 * O modo converter com os codecs reais — a prova da promessa.
 *
 * "Sem perda" é uma afirmação sobre bytes, e afirmação sobre bytes se verifica
 * comparando bytes. Aqui um PNG vira WebP, volta a PNG **passando pelo motor de
 * produção nas duas idas**, e os pixels são comparados um a um. Se algum dia
 * alguém trocar a flag do encoder por uma qualidade alta qualquer, estes testes
 * caem — que é exatamente o ponto.
 *
 * O que cada formato faz com o pedido de "sem perda" está medido, não suposto:
 *
 * | Destino | Como                             | Sem perda de verdade?           |
 * | ------- | -------------------------------- | ------------------------------- |
 * | PNG     | quantizador desligado            | ✅ por definição do formato      |
 * | WebP    | `lossless: 1` + `exact: 1`       | ✅ inclusive nos pixels invisíveis |
 * | AVIF    | `lossless: true` (q100 · 4:4:4)  | ✅ verificado byte a byte        |
 * | JPEG    | qualidade máxima                 | ❌ o formato não tem modo sem perda |
 */

import { beforeAll, describe, expect, it } from 'vitest'
import type { JobContext, JobOptions } from '@/engine/core/types'
import { ImageEngine } from '@/engine/image/engine'
import { readImageHeader } from '@/engine/image/probe'
import { MESSAGES } from '@/engine/image/strategy'
import { initNodeAvif, initNodeCodecs } from '../helpers/codecs-node'
import { synthPhoto } from '../helpers/images'

const converter: JobOptions = {
  mode: 'convert',
  preset: 5,
  outputFormat: 'smart',
  // Baixa de propósito: no modo converter a qualidade da UI não pode reintroduzir
  // perda nenhuma — nem pelo quantizador do PNG, nem pelo encoder.
  quality: 35,
}

function jobContext(): JobContext {
  return { onProgress: () => {}, signal: new AbortController().signal }
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * A mesma foto sintética dos outros testes, com buracos totalmente
 * transparentes: é o caso em que o libwebp descarta o RGB escondido atrás do
 * alfa se `exact` não for pedido.
 */
function photoWithHoles(width: number, height: number): ImageData {
  const image = synthPhoto(width, height)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (pixel % 97 === 0) image.data[pixel * 4 + 3] = 0
  }
  return image
}

async function pngFileOf(image: ImageData, name = 'arte.png'): Promise<File> {
  const { default: encode } = await import('@jsquash/png/encode')
  return new File([await encode(image)], name, { type: 'image/png' })
}

async function decodePng(bytes: Uint8Array): Promise<ImageData> {
  const { default: decode } = await import('@jsquash/png/decode')
  return await decode(bytes.buffer as ArrayBuffer)
}

/** Quantos subpixels diferem — zero é a única resposta aceitável aqui. */
function differences(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return Math.max(a.length, b.length)

  let count = 0
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) count += 1
  }
  return count
}

/** Converte um arquivo com o motor de produção, sem injeção nenhuma. */
async function convert(file: File, outputFormat: JobOptions['outputFormat']) {
  return await new ImageEngine().process(file, { ...converter, outputFormat }, jobContext())
}

/** O resultado de uma conversão vira a entrada da próxima. */
function fileOf(result: { blob: Blob; outputName: string }): File {
  return new File([result.blob], result.outputName, { type: result.blob.type })
}

beforeAll(async () => {
  await initNodeCodecs()
}, 60_000)

describe('PNG → WebP → PNG', () => {
  it('devolve exatamente os mesmos pixels', async () => {
    const original = synthPhoto(240, 180)
    const file = await pngFileOf(original)

    const paraWebp = await convert(file, 'webp')
    const webpBytes = await bytesOf(paraWebp.blob)

    // A prova de que o encoder recebeu o pedido de lossless e não uma
    // qualidade alta: o WebP sem perda usa o chunk VP8L, o com perda usa VP8.
    expect(new TextDecoder().decode(webpBytes.subarray(12, 16))).toBe('VP8L')
    expect(readImageHeader(webpBytes)).toMatchObject({ format: 'webp', width: 240, height: 180 })

    const deVolta = await convert(fileOf(paraWebp), 'png')

    const final = await decodePng(await bytesOf(deVolta.blob))
    expect(final.width).toBe(240)
    expect(final.height).toBe(180)
    expect(differences(original.data, final.data)).toBe(0)
  }, 120_000)

  it('preserva o RGB atrás dos pixels transparentes', async () => {
    // Sem `exact: 1` o libwebp zera o que está invisível e economiza bytes — o
    // arquivo continua "lossless" para quem só olha o que aparece, e deixa de
    // ser para quem edita a imagem depois.
    const original = photoWithHoles(160, 120)
    const file = await pngFileOf(original, 'com-alfa.png')

    const paraWebp = await convert(file, 'webp')
    const deVolta = await convert(fileOf(paraWebp), 'png')

    const final = await decodePng(await bytesOf(deVolta.blob))
    expect(differences(original.data, final.data)).toBe(0)
  }, 120_000)
})

describe('PNG → AVIF → PNG', () => {
  it('devolve exatamente os mesmos pixels', async () => {
    // O estudo (docs/HANDOFF-CONVERSAO.md §4.5) supunha que o `@jsquash/avif`
    // não expunha lossless. A versão instalada expõe: a flag fixa quality 100,
    // qualityAlpha -1 e subsample 3 (YUV 4:4:4), e o resultado é bit-exato.
    await initNodeAvif()

    const original = synthPhoto(128, 96)
    const file = await pngFileOf(original, 'still.png')

    const paraAvif = await convert(file, 'avif')
    expect(paraAvif.blob.type).toBe('image/avif')

    const deVolta = await convert(fileOf(paraAvif), 'png')

    const final = await decodePng(await bytesOf(deVolta.blob))
    expect(differences(original.data, final.data)).toBe(0)
  }, 300_000)
})

describe('PNG → PNG', () => {
  it('não quantiza, por mais baixa que seja a qualidade escolhida', async () => {
    const original = synthPhoto(200, 150)
    const file = await pngFileOf(original)

    const result = await convert(file, 'png')
    const final = await decodePng(await bytesOf(result.blob))

    // No modo automático com qualidade 35 este mesmo arquivo sairia com uma
    // paleta de 64 cores. Aqui os pixels são os mesmos, um a um.
    expect(differences(original.data, final.data)).toBe(0)
  }, 120_000)
})

describe('JPEG → PNG', () => {
  it('avisa que o arquivo ficou maior, e diz por quê', async () => {
    const { default: encodeJpeg } = await import('@jsquash/jpeg/encode')
    const jpeg = await encodeJpeg(synthPhoto(400, 300), { quality: 70 })
    const file = new File([jpeg], 'foto.jpg', { type: 'image/jpeg' })

    const result = await convert(file, 'png')

    // O PNG guarda os pixels que o JPEG jogou fora — o arquivo cresce, e isso
    // está certo. O que não pode é acontecer sem explicação.
    expect(result.compressedBytes).toBeGreaterThan(result.originalBytes)
    expect(result.status).toBe('warning')
    expect(result.message).toBe(MESSAGES.convertLarger)
    expect(result.savedPercent).toBeLessThan(0)
  }, 120_000)
})
