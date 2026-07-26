/**
 * O motor com os codecs reais.
 *
 * Os testes de `tests/unit/engine.test.ts` provam a coordenação com codecs
 * injetados: decode único, cache de escala, progresso, cancelamento,
 * nomenclatura. Eles não provam que um JPEG vira um WebP — nenhum byte de WASM
 * roda lá.
 *
 * Aqui roda. `ImageEngine` sem injeção nenhuma, usando os `browserCodecs` de
 * produção, sobre arquivos gerados pelos próprios encoders. É a verificação de
 * ponta a ponta que a definição de pronto do Incremento 3 pede — com uma
 * limitação honesta: em Node não existe `createImageBitmap`, então o caminho
 * exercitado é o do **fallback WASM**. O decode nativo depende de navegador e
 * fica para o E2E do Incremento 7.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import type { JobContext, JobOptions } from '@/engine/core/types'
import { ImageEngine } from '@/engine/image/engine'
import { paletteSizeForQuality } from '@/engine/image/quantize'
import { readImageHeader } from '@/engine/image/probe'
import { initNodeAvif, initNodeCodecs } from '../helpers/codecs-node'
import { synthPhoto } from '../helpers/images'

function jobContext() {
  const progress: number[] = []
  const ctx: JobContext = {
    onProgress: (percent) => progress.push(percent),
    signal: new AbortController().signal,
  }
  return { ctx, progress }
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

/** Um arquivo de entrada de verdade, produzido pelo encoder de verdade. */
async function sourceJpeg(width: number, height: number, quality = 90): Promise<File> {
  const { default: encode } = await import('@jsquash/jpeg/encode')
  const bytes = await encode(synthPhoto(width, height), { quality })
  return new File([bytes], 'foto.jpg', { type: 'image/jpeg' })
}

async function sourcePng(width: number, height: number): Promise<File> {
  const { default: encode } = await import('@jsquash/png/encode')
  const bytes = await encode(synthPhoto(width, height))
  return new File([bytes], 'arte.png', { type: 'image/png' })
}

const auto: JobOptions = { mode: 'auto', preset: 5, outputFormat: 'smart', quality: 82 }

beforeAll(async () => {
  await initNodeCodecs()
}, 60_000)

describe('modo automático com codecs reais', () => {
  it('converte um JPEG em um WebP menor e decodificável', async () => {
    const file = await sourceJpeg(800, 600)
    const engine = new ImageEngine()
    const { ctx, progress } = jobContext()

    const result = await engine.process(file, auto, ctx)

    expect(result.status).toBe('success')
    expect(result.outputName).toBe('foto-compressify.webp')
    expect(result.compressedBytes).toBeLessThan(result.originalBytes)
    expect(result.savedPercent).toBeGreaterThan(0)
    expect(progress.at(-1)).toBe(100)

    // O que saiu é mesmo um WebP, e com as dimensões que o motor relatou.
    const saida = await bytesOf(result.blob)
    expect(readImageHeader(saida)).toEqual({
      format: 'webp',
      width: 800,
      height: 600,
      bitDepth: null,
    })

    const { default: decode } = await import('@jsquash/webp/decode')
    const decodificado = await decode(saida.buffer as ArrayBuffer)
    expect(decodificado.width).toBe(800)
    expect(decodificado.height).toBe(600)
  }, 60_000)

  it('produz JPEG quando o usuário escolhe JPEG', async () => {
    const file = await sourcePng(400, 300)
    const engine = new ImageEngine()
    const { ctx } = jobContext()

    const result = await engine.process(file, { ...auto, outputFormat: 'jpeg' }, ctx)

    expect(result.outputName).toBe('arte-compressify.jpg')
    const header = readImageHeader(await bytesOf(result.blob))
    expect(header?.format).toBe('jpeg')
    expect(header?.width).toBe(400)
  }, 60_000)
})

describe('modo meta de tamanho com codecs reais', () => {
  it('respeita a meta e reporta as dimensões que realmente codificou', async () => {
    // 1600×1200 permite exatamente um nível de redução antes do piso de 900px:
    // 1200 × 0,84 = 1008 ✅, e o seguinte daria 846 ❌.
    const file = await sourceJpeg(1600, 1200, 95)
    const engine = new ImageEngine()
    const { ctx } = jobContext()

    const result = await engine.process(
      file,
      {
        mode: 'target',
        preset: 'custom',
        customTargetMb: 0.05,
        outputFormat: 'smart',
        quality: 95,
      },
      ctx,
    )

    const alvo = Math.round(0.05 * 1024 * 1024)
    const saida = await bytesOf(result.blob)
    const header = readImageHeader(saida)

    // Ou a meta foi atingida, ou o motor avisou que não dava — nunca entregar
    // acima da meta em silêncio, que é exatamente o defeito que reprovou o
    // `target_size` do libwebp no spike (docs/SPIKE.md §5.4).
    if (result.status === 'success') {
      expect(result.compressedBytes).toBeLessThanOrEqual(alvo)
    } else {
      expect(result.message).toBeTruthy()
    }

    // As dimensões relatadas são as dos bytes entregues, com resize ou sem.
    expect(header?.width).toBe(result.width)
    expect(header?.height).toBe(result.height)
    expect(result.width).toBeLessThanOrEqual(1600)
    expect(Math.min(result.width, result.height)).toBeGreaterThanOrEqual(900)
  }, 120_000)
})

describe('PNG com perda: quantizador + oxipng', () => {
  it('reduz as cores à paleta derivada da qualidade e mantém o PNG válido', async () => {
    const file = await sourcePng(400, 300)
    const engine = new ImageEngine()
    const { ctx } = jobContext()

    // Abaixo de 88 o Sharp usava paleta indexada; nós usamos o quantizador
    // próprio (docs/PLANO.md §3.4).
    const result = await engine.process(
      file,
      { ...auto, outputFormat: 'original', quality: 60 },
      ctx,
    )

    const saida = await bytesOf(result.blob)
    expect(readImageHeader(saida)?.format).toBe('png')

    const { default: decode } = await import('@jsquash/png/decode')
    const decodificado = await decode(saida.buffer as ArrayBuffer)
    expect(decodificado.width).toBe(400)

    const cores = new Set<number>()
    for (let i = 0; i < decodificado.data.length; i += 4) {
      cores.add(
        ((decodificado.data[i] ?? 0) << 16) |
          ((decodificado.data[i + 1] ?? 0) << 8) |
          (decodificado.data[i + 2] ?? 0),
      )
    }

    // A prova de que o quantizador rodou de verdade, e não só não quebrou.
    expect(cores.size).toBeLessThanOrEqual(paletteSizeForQuality(60))
    expect(cores.size).toBeGreaterThan(1)
  }, 120_000)

  it('não quantiza acima do limiar de 88', async () => {
    const file = await sourcePng(200, 150)
    const engine = new ImageEngine()
    const { ctx } = jobContext()

    const result = await engine.process(
      file,
      { ...auto, outputFormat: 'original', quality: 95 },
      ctx,
    )

    const { default: decode } = await import('@jsquash/png/decode')
    const decodificado = await decode((await bytesOf(result.blob)).buffer as ArrayBuffer)

    const cores = new Set<number>()
    for (let i = 0; i < decodificado.data.length; i += 4) {
      cores.add(
        ((decodificado.data[i] ?? 0) << 16) |
          ((decodificado.data[i + 1] ?? 0) << 8) |
          (decodificado.data[i + 2] ?? 0),
      )
    }

    // Sem perda: uma foto sintética tem muito mais que 256 cores distintas.
    expect(cores.size).toBeGreaterThan(256)
  }, 120_000)
})

describe('AVIF com speed 8', () => {
  it('produz um AVIF válido', async () => {
    await initNodeAvif()

    const file = await sourceJpeg(256, 256)
    const engine = new ImageEngine()
    const { ctx } = jobContext()

    const result = await engine.process(file, { ...auto, outputFormat: 'avif' }, ctx)

    expect(result.outputName).toBe('foto-compressify.avif')
    expect(result.blob.type).toBe('image/avif')

    const header = readImageHeader(await bytesOf(result.blob))
    expect(header?.format).toBe('avif')
    expect(header?.width).toBe(256)
    expect(header?.height).toBe(256)
  }, 180_000)
})
