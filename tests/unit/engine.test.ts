import { describe, expect, it } from 'vitest'
import type { ImageFormat, JobContext, JobOptions } from '@/engine/core/types'
import {
  ENGINE_MESSAGES,
  ImageEngine,
  UnsupportedInputError,
  type ImageCodecs,
} from '@/engine/image/engine'
import type { DecodeOptions, RgbaImage } from '@/engine/image/decode'
import { AbortedError, MESSAGES, QUALITY_MAX } from '@/engine/image/strategy'
import { imageFile, jpegHeader, pngHeader } from '../helpers/images'

/**
 * Codecs falsos com modelo de tamanho conhecido.
 *
 * O motor é exercitado inteiro — decode, cache de escala, estratégia,
 * progresso, nomenclatura — sem carregar um byte de WASM. Os pixels não são
 * lidos por ninguém aqui, então `data` é um stub de 4 bytes: alocar 48 MB por
 * teste para dados que ninguém inspeciona seria desperdício.
 */
function stubImage(width: number, height: number): RgbaImage {
  return { data: new Uint8ClampedArray(4), width, height }
}

interface EncodeCall {
  format: ImageFormat
  quality: number
  width: number
  height: number
  /** O pedido de saída sem perda — o que distingue o modo converter. */
  lossless: boolean
}

interface FakeCodecOptions {
  width?: number
  height?: number
  baseBytes?: number
  /** Piso artificial: nenhum resultado fica menor que isto. */
  floorBytes?: number
  /** Gancho para cancelar ou falhar no meio da fila de encodes. */
  onEncode?: (call: EncodeCall, index: number) => void
}

function fakeCodecs(options: FakeCodecOptions = {}) {
  const width = options.width ?? 4000
  const height = options.height ?? 3000
  const base = options.baseBytes ?? 400_000
  const original = stubImage(width, height)

  const calls = {
    decode: [] as DecodeOptions[],
    encode: [] as EncodeCall[],
    resize: [] as Array<{ from: RgbaImage; width: number; height: number }>,
  }

  const codecs: ImageCodecs = {
    decode(_blob, decodeOptions) {
      calls.decode.push(decodeOptions)
      return Promise.resolve({ image: original, source: 'native' as const })
    },

    encode(image, format, quality, encodeOptions) {
      const call: EncodeCall = {
        format,
        quality,
        width: image.width,
        height: image.height,
        lossless: encodeOptions?.lossless ?? false,
      }
      options.onEncode?.(call, calls.encode.length)
      calls.encode.push(call)

      // Cresce com a qualidade e cai com a área — as duas propriedades que a
      // estratégia assume dos encoders reais.
      const qualityFactor = 0.2 + (quality / QUALITY_MAX) * 0.8
      const areaRatio = (image.width * image.height) / (width * height)
      const size = Math.round(base * qualityFactor * areaRatio)

      return Promise.resolve(new Uint8Array(Math.max(options.floorBytes ?? 1, size)))
    },

    resize(image, nextWidth, nextHeight) {
      calls.resize.push({ from: image, width: nextWidth, height: nextHeight })
      return Promise.resolve(stubImage(nextWidth, nextHeight))
    },
  }

  return { codecs, calls, original }
}

function jobContext(signal?: AbortSignal) {
  const progress: number[] = []
  const ctx: JobContext = {
    onProgress(percent) {
      progress.push(percent)
    },
    signal: signal ?? new AbortController().signal,
  }
  return { ctx, progress }
}

const auto: JobOptions = {
  mode: 'auto',
  preset: 5,
  outputFormat: 'smart',
  quality: 82,
}

const target: JobOptions = {
  mode: 'target',
  preset: 5,
  outputFormat: 'smart',
  quality: 95,
}

/** A qualidade baixa é de propósito: o modo converter tem de ignorá-la. */
const converter: JobOptions = {
  mode: 'convert',
  preset: 5,
  outputFormat: 'smart',
  quality: 35,
}

describe('ImageEngine.supports', () => {
  const engine = new ImageEngine()

  it('aceita os formatos de entrada pela extensão', () => {
    for (const name of ['foto.jpg', 'foto.JPEG', 'arte.png', 'banner.webp', 'still.avif']) {
      expect(engine.supports(imageFile({ name }))).toBe(true)
    }
  })

  it('aceita pelo tipo MIME quando não há extensão', () => {
    expect(engine.supports(imageFile({ name: 'colado', type: 'image/png' }))).toBe(true)
  })

  it('recusa TIFF, que o app Electron aceitava', () => {
    expect(engine.supports(imageFile({ name: 'scan.tif' }))).toBe(false)
    expect(engine.supports(imageFile({ name: 'scan.tiff' }))).toBe(false)
  })

  it('recusa o que não é imagem', () => {
    expect(engine.supports(imageFile({ name: 'relatorio.pdf' }))).toBe(false)
  })
})

describe('ImageEngine.probe', () => {
  it('lê dimensões do cabeçalho sem decodificar', async () => {
    const { codecs, calls } = fakeCodecs()
    const engine = new ImageEngine({ codecs })

    const metadata = await engine.probe(
      imageFile({
        name: 'foto.jpg',
        header: jpegHeader({ width: 4032, height: 3024 }),
        bytes: 2_000_000,
      }),
    )

    expect(metadata).toEqual({ width: 4032, height: 3024, format: 'jpeg', bytes: 2_000_000 })
    // O orçamento de megapixels do pool precisa disto por arquivo; decodificar
    // 50 imagens só para medir dobraria o trabalho.
    expect(calls.decode).toHaveLength(0)
  })

  it('cai no decode quando o cabeçalho é ilegível', async () => {
    const { codecs, calls } = fakeCodecs({ width: 800, height: 600 })
    const engine = new ImageEngine({ codecs })

    const metadata = await engine.probe(imageFile({ name: 'estranho.jpg', bytes: 1000 }))

    expect(metadata).toEqual({ width: 800, height: 600, format: null, bytes: 1000 })
    expect(calls.decode).toHaveLength(1)
  })
})

describe('ImageEngine.process — modo automático', () => {
  it('comprime de ponta a ponta e devolve o resultado completo', async () => {
    const { codecs, calls } = fakeCodecs({ baseBytes: 400_000 })
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext()

    const file = imageFile({
      name: 'foto.jpg',
      header: jpegHeader({ width: 4000, height: 3000 }),
      bytes: 1_000_000,
    })
    const result = await engine.process(file, auto, ctx)

    expect(result.status).toBe('success')
    expect(result.message).toBeUndefined()
    // `smart` converte para WebP — comportamento do app Electron.
    expect(result.outputName).toBe('foto-compressify.webp')
    expect(result.blob.type).toBe('image/webp')
    expect(result.blob.size).toBe(result.compressedBytes)
    expect(result.originalBytes).toBe(1_000_000)
    expect(result.savedBytes).toBe(1_000_000 - result.compressedBytes)
    expect(result.savedPercent).toBeCloseTo((result.savedBytes / 1_000_000) * 100)
    expect(result.width).toBe(4000)
    expect(result.height).toBe(3000)

    // Caminho comum: converter formato resolve no primeiro degrau.
    expect(calls.encode).toEqual([
      { format: 'webp', quality: 82, width: 4000, height: 3000, lossless: false },
    ])
    expect(calls.resize).toHaveLength(0)
  })

  it('desce a escada de qualidade e nunca redimensiona', async () => {
    const { codecs, calls } = fakeCodecs({ baseBytes: 1_000_000 })
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext()

    const file = imageFile({ name: 'foto.jpg', bytes: 700_000 })
    const result = await engine.process(file, auto, ctx)

    expect(calls.encode.length).toBeGreaterThan(1)
    expect(calls.encode.every((call) => call.width === 4000)).toBe(true)
    expect(calls.resize).toHaveLength(0)
    expect(result.compressedBytes).toBeLessThan(700_000)
  })

  it('avisa quando nem o degrau mais agressivo reduz', async () => {
    const { codecs } = fakeCodecs({ baseBytes: 1_000_000, floorBytes: 900_000 })
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext()

    const result = await engine.process(imageFile({ name: 'foto.jpg', bytes: 100_000 }), auto, ctx)

    expect(result.status).toBe('warning')
    expect(result.message).toBe(MESSAGES.automaticFloor)
  })
})

describe('ImageEngine.process — modo meta de tamanho', () => {
  it('atinge a meta reduzindo a resolução e reporta as dimensões finais', async () => {
    const { codecs, calls } = fakeCodecs({ baseBytes: 10_000_000 })
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext()

    const file = imageFile({ name: 'foto.jpg', bytes: 12_000_000 })
    const result = await engine.process(
      file,
      { ...target, preset: 'custom', customTargetMb: 0.5 },
      ctx,
    )

    expect(result.status).toBe('success')
    expect(result.compressedBytes).toBeLessThanOrEqual(0.5 * 1024 * 1024)
    expect(result.width).toBeLessThan(4000)
    expect(result.height).toBeLessThan(3000)
    // As dimensões relatadas são as que foram efetivamente codificadas.
    const último = calls.encode.at(-1)
    expect(result.width).toBe(último?.width)
    expect(result.height).toBe(último?.height)
  })

  it('decodifica uma única vez, por mais encodes que a busca faça', async () => {
    const { codecs, calls } = fakeCodecs({ baseBytes: 50_000_000, floorBytes: 5_000_000 })
    const engine = new ImageEngine({ codecs, timeBudgetMs: Number.POSITIVE_INFINITY })
    const { ctx } = jobContext()

    await engine.process(imageFile({ name: 'foto.jpg', bytes: 60_000_000 }), target, ctx)

    // É o que faz o modo meta ficar mais rápido que o app desktop, que
    // re-decodifica o arquivo a cada tentativa (docs/SPIKE.md §6).
    expect(calls.decode).toHaveLength(1)
    expect(calls.encode.length).toBeGreaterThan(10)
  })

  it('redimensiona sempre a partir do original, um resize por nível de escala', async () => {
    const { codecs, calls, original } = fakeCodecs({ baseBytes: 50_000_000, floorBytes: 5_000_000 })
    const engine = new ImageEngine({ codecs, timeBudgetMs: Number.POSITIVE_INFINITY })
    const { ctx } = jobContext()

    await engine.process(imageFile({ name: 'foto.jpg', bytes: 60_000_000 }), target, ctx)

    // Encadear resizes degradaria a qualidade a cada passo.
    expect(calls.resize.every((call) => call.from === original)).toBe(true)

    // O cache de um slot é o que transforma 56 resizes em 8 no pior caso.
    const escalas = new Set(calls.resize.map((call) => `${call.width}x${call.height}`))
    expect(escalas.size).toBe(calls.resize.length)
    expect(calls.resize.length).toBeLessThanOrEqual(8)

    // Piso de 900px: nenhuma escala pedida viola o contrato.
    for (const call of calls.resize) {
      expect(Math.min(call.width, call.height)).toBeGreaterThanOrEqual(900)
    }
  })

  it('recusa meta de tamanho inválida em vez de buscar às cegas', async () => {
    const { codecs } = fakeCodecs()
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext()

    await expect(
      engine.process(
        imageFile({ name: 'foto.jpg', bytes: 1000 }),
        { ...target, preset: 'custom' },
        ctx,
      ),
    ).rejects.toThrow(ENGINE_MESSAGES.invalidTarget)
  })

  it('marca como aviso o resultado maior que o original', async () => {
    // Arquivo minúsculo: o piso de 1 KB da meta efetiva permite um resultado
    // que cabe na meta e ainda assim é maior que a entrada.
    const { codecs } = fakeCodecs({ baseBytes: 800, floorBytes: 800 })
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext()

    const result = await engine.process(imageFile({ name: 'icone.png', bytes: 500 }), target, ctx)

    expect(result.compressedBytes).toBeGreaterThan(result.originalBytes)
    expect(result.savedBytes).toBeLessThan(0)
    expect(result.status).toBe('warning')
    expect(result.message).toBe(ENGINE_MESSAGES.largerThanOriginal)
  })
})

describe('ImageEngine.process — modo converter', () => {
  it('faz um encode só, sem perda e sem redimensionar', async () => {
    const { codecs, calls } = fakeCodecs({ baseBytes: 400_000 })
    const engine = new ImageEngine({ codecs })
    const { ctx, progress } = jobContext()

    const file = imageFile({
      name: 'foto.jpg',
      header: jpegHeader({ width: 4000, height: 3000 }),
      bytes: 1_000_000,
    })
    const result = await engine.process(file, converter, ctx)

    // A qualidade da UI (35) não chega ao encoder: converter pede o teto, e o
    // pedido de saída sem perda viaja junto para o `codecs.ts` decidir o que
    // cada formato faz com ele.
    expect(calls.encode).toEqual([
      { format: 'webp', quality: QUALITY_MAX, width: 4000, height: 3000, lossless: true },
    ])
    expect(calls.resize).toHaveLength(0)
    expect(calls.decode).toHaveLength(1)
    expect(result.status).toBe('success')
    expect(result.width).toBe(4000)
    expect(result.height).toBe(3000)
    expect(progress.at(-1)).toBe(100)
  })

  it('avisa que o arquivo ficou maior, em vez de reportar sucesso', async () => {
    // O caso do JPEG que vira PNG sem perda: 0,76 MB viram 2,23 MB.
    const { codecs } = fakeCodecs({ baseBytes: 3_000_000 })
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext()

    const result = await engine.process(
      imageFile({ name: 'foto.jpg', bytes: 760_000 }),
      { ...converter, outputFormat: 'png' },
      ctx,
    )

    expect(result.status).toBe('warning')
    // A mensagem específica do modo converter, não a genérica de "ficou maior":
    // sem o porquê, o número lê como defeito.
    expect(result.message).toBe(MESSAGES.convertLarger)
    expect(result.savedBytes).toBeLessThan(0)
    expect(result.outputName).toBe('foto-compressify.png')
  })

  it('não desce a escada de qualidade mesmo sem reduzir nada', async () => {
    const { codecs, calls } = fakeCodecs({ baseBytes: 1_000_000, floorBytes: 900_000 })
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext()

    await engine.process(imageFile({ name: 'foto.jpg', bytes: 100_000 }), converter, ctx)

    // No modo automático este mesmo cenário gastaria os sete degraus.
    expect(calls.encode).toHaveLength(1)
  })
})

describe('ImageEngine.process — formato de saída', () => {
  it('mantém AVIF em AVIF no modo smart', async () => {
    const { codecs, calls } = fakeCodecs()
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext()

    const result = await engine.process(
      imageFile({ name: 'still.avif', bytes: 900_000 }),
      auto,
      ctx,
    )

    expect(calls.encode[0]?.format).toBe('avif')
    expect(result.outputName).toBe('still-compressify.avif')
    expect(result.blob.type).toBe('image/avif')
  })

  it('respeita "manter original"', async () => {
    const { codecs, calls } = fakeCodecs()
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext()

    const result = await engine.process(
      imageFile({ name: 'arte.png', bytes: 900_000 }),
      { ...auto, outputFormat: 'original' },
      ctx,
    )

    expect(calls.encode[0]?.format).toBe('png')
    expect(result.outputName).toBe('arte-compressify.png')
  })
})

describe('ImageEngine.process — decodificação', () => {
  it('roteia PNG de 16 bits para o caminho WASM', async () => {
    const { codecs, calls } = fakeCodecs()
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext()

    await engine.process(
      imageFile({
        name: 'arte.png',
        header: pngHeader({ width: 4000, height: 3000, bitDepth: 16 }),
        bytes: 900_000,
      }),
      auto,
      ctx,
    )

    // O canvas rebaixaria para 8 bits antes de qualquer decisão nossa.
    expect(calls.decode[0]).toEqual({ format: 'png', preferWasm: true })
  })

  it('deixa PNG de 8 bits no caminho nativo', async () => {
    const { codecs, calls } = fakeCodecs()
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext()

    await engine.process(
      imageFile({
        name: 'arte.png',
        header: pngHeader({ width: 4000, height: 3000 }),
        bytes: 900_000,
      }),
      auto,
      ctx,
    )

    expect(calls.decode[0]).toEqual({ format: 'png', preferWasm: false })
  })
})

describe('ImageEngine.process — progresso', () => {
  it('é monotônico, reserva 10% ao decode e trava em 95% até o resultado', async () => {
    const { codecs } = fakeCodecs({ baseBytes: 1_000_000 })
    const engine = new ImageEngine({ codecs })
    const { ctx, progress } = jobContext()

    await engine.process(imageFile({ name: 'foto.jpg', bytes: 700_000 }), auto, ctx)

    expect(progress[0]).toBe(10)
    expect(progress.at(-1)).toBe(100)
    for (const [index, percent] of progress.entries()) {
      expect(percent).toBeGreaterThan(progress[index - 1] ?? -1)
      expect(percent).toBeLessThanOrEqual(100)
    }
    // Progresso que retrocede lê como bug mesmo quando é honesto.
    expect(progress.slice(0, -1).every((percent) => percent <= 95)).toBe(true)
  })

  it('não retrocede quando a busca de meta reestima o total', async () => {
    const { codecs } = fakeCodecs({ baseBytes: 50_000_000, floorBytes: 5_000_000 })
    const engine = new ImageEngine({ codecs, timeBudgetMs: Number.POSITIVE_INFINITY })
    const { ctx, progress } = jobContext()

    await engine.process(imageFile({ name: 'foto.jpg', bytes: 60_000_000 }), target, ctx)

    const ordenado = [...progress].sort((a, b) => a - b)
    expect(progress).toEqual(ordenado)
    expect(progress.at(-1)).toBe(100)
  })
})

describe('ImageEngine.process — cancelamento e orçamento de tempo', () => {
  it('nem começa quando o sinal já veio abortado', async () => {
    const { codecs, calls } = fakeCodecs()
    const engine = new ImageEngine({ codecs })
    const controller = new AbortController()
    controller.abort()
    const { ctx } = jobContext(controller.signal)

    await expect(
      engine.process(imageFile({ name: 'foto.jpg', bytes: 1000 }), auto, ctx),
    ).rejects.toBeInstanceOf(AbortedError)
    expect(calls.decode).toHaveLength(0)
  })

  it('interrompe entre tentativas quando o usuário cancela a fila', async () => {
    const controller = new AbortController()
    const { codecs, calls } = fakeCodecs({
      baseBytes: 1_000_000,
      floorBytes: 900_000,
      onEncode: (_call, index) => {
        if (index === 1) controller.abort()
      },
    })
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext(controller.signal)

    await expect(
      engine.process(imageFile({ name: 'foto.jpg', bytes: 100_000 }), auto, ctx),
    ).rejects.toBeInstanceOf(AbortedError)
    // Um encode individual não é interrompível; o corte é entre tentativas.
    expect(calls.encode).toHaveLength(2)
  })

  it('devolve o melhor resultado obtido quando o orçamento de tempo estoura', async () => {
    // O teto existe por causa do Firefox: lá o pior caso do modo meta numa
    // imagem de 12MP chega a ~305 s (docs/SPIKE.md §6).
    const { codecs, calls } = fakeCodecs({ baseBytes: 50_000_000, floorBytes: 5_000_000 })
    const engine = new ImageEngine({ codecs, timeBudgetMs: 0 })
    const { ctx } = jobContext()

    const result = await engine.process(
      imageFile({ name: 'foto.jpg', bytes: 60_000_000 }),
      target,
      ctx,
    )

    expect(result.status).toBe('warning')
    expect(result.message).toBe(MESSAGES.timeout)
    expect(calls.encode).toHaveLength(1)
    expect(result.blob.size).toBeGreaterThan(0)
  })
})

describe('ImageEngine.process — nomenclatura', () => {
  it('preserva a estrutura relativa de subpastas', async () => {
    const { codecs } = fakeCodecs()
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext()

    const result = await engine.process(
      imageFile({ name: 'praia.jpg', relativePath: 'ferias/2026/praia.jpg', bytes: 900_000 }),
      auto,
      ctx,
    )

    expect(result.outputName).toBe('ferias/2026/praia-compressify.webp')
  })

  it('desambigua colisões dentro do mesmo lote', async () => {
    const { codecs } = fakeCodecs()
    const taken = new Set<string>()
    const engine = new ImageEngine({ codecs, taken })
    const { ctx } = jobContext()

    const primeiro = await engine.process(
      imageFile({ name: 'foto.jpg', bytes: 900_000 }),
      auto,
      ctx,
    )
    const segundo = await engine.process(imageFile({ name: 'foto.jpg', bytes: 900_000 }), auto, ctx)

    expect(primeiro.outputName).toBe('foto-compressify.webp')
    expect(segundo.outputName).toBe('foto-compressify-1.webp')
  })
})

describe('ImageEngine.process — entrada não suportada', () => {
  it('recusa TIFF com erro tipado, em vez de falhar no decode', async () => {
    const { codecs, calls } = fakeCodecs()
    const engine = new ImageEngine({ codecs })
    const { ctx } = jobContext()

    await expect(
      engine.process(imageFile({ name: 'scan.tif', bytes: 1000 }), auto, ctx),
    ).rejects.toBeInstanceOf(UnsupportedInputError)
    expect(calls.decode).toHaveLength(0)
  })
})
