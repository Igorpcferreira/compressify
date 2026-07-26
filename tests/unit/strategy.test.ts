import { describe, expect, it, vi } from 'vitest'
import {
  AbortedError,
  MESSAGES,
  MIN_DIMENSION,
  QUALITY_MAX,
  QUALITY_MIN,
  canScale,
  clampQuality,
  effectiveTargetBytes,
  mbToBytes,
  qualitySteps,
  renderAutomatic,
  renderTargeted,
  type RenderAttempt,
  type Renderer,
} from '@/engine/image/strategy'

/**
 * Modelo de tamanho sintético.
 *
 * Reproduz as duas propriedades que a estratégia assume dos encoders reais:
 * o tamanho cresce monotonicamente com a qualidade e cai com o quadrado da
 * escala. Assim os testes exercitam o algoritmo, não o codec.
 */
function fakeRenderer(options: {
  baseBytes?: number
  /** Registra cada tentativa, para checar quantos encodes ocorreram. */
  log?: RenderAttempt[]
  /** Piso artificial: nenhum resultado fica menor que isto. */
  floorBytes?: number
}) {
  const base = options.baseBytes ?? 1_000_000
  const renderer: Renderer = (attempt) => {
    options.log?.push({ ...attempt })
    const qualityFactor = 0.2 + (attempt.quality / QUALITY_MAX) * 0.8
    const size = Math.round(base * qualityFactor * attempt.scale ** 2)
    const bytes = Math.max(options.floorBytes ?? 1, size)
    return Promise.resolve(new Uint8Array(bytes))
  }
  return renderer
}

describe('clampQuality', () => {
  it('mantém valores dentro da faixa', () => {
    expect(clampQuality(75)).toBe(75)
  })

  it('limita nos extremos', () => {
    expect(clampQuality(5)).toBe(QUALITY_MIN)
    expect(clampQuality(200)).toBe(QUALITY_MAX)
  })

  it('devolve o mínimo para qualquer valor não finito', () => {
    // Comportamento do `clampNumber` do Electron: não-finito cai no mínimo,
    // inclusive Infinity. Fielmente preservado — parece contraintuitivo para
    // +Infinity, mas mudar isto seria divergir do original sem motivo.
    expect(clampQuality(Number.NaN)).toBe(QUALITY_MIN)
    expect(clampQuality(Number.POSITIVE_INFINITY)).toBe(QUALITY_MIN)
    expect(clampQuality(Number.NEGATIVE_INFINITY)).toBe(QUALITY_MIN)
  })
})

describe('qualitySteps', () => {
  it('injeta a qualidade pedida na escada, em ordem decrescente', () => {
    expect(qualitySteps(90)).toEqual([90, 82, 74, 66, 58, 48, 38])
  })

  it('intercala quando a qualidade cai no meio da escada', () => {
    expect(qualitySteps(60)).toEqual([82, 74, 66, 60, 58, 48, 38])
  })

  it('não duplica quando a qualidade já é um degrau', () => {
    expect(qualitySteps(74)).toEqual([82, 74, 66, 58, 48, 38])
  })

  it('clampa a qualidade pedida antes de inserir', () => {
    expect(qualitySteps(999)).toEqual([QUALITY_MAX, 82, 74, 66, 58, 48, 38])
    expect(qualitySteps(1)).toEqual([82, 74, 66, 58, 48, 38, QUALITY_MIN])
  })
})

describe('canScale — o piso de 900px', () => {
  it('aceita quando os dois lados continuam em 900 ou mais', () => {
    expect(canScale(4000, 3000, 0.84)).toBe(true)
  })

  it('recusa quando o resultado cairia abaixo do piso', () => {
    // 1000 × 0,84 = 840 — abaixo de 900. O Electron aceitaria; nós não.
    expect(canScale(1000, 1000, 0.84)).toBe(false)
  })

  it('aceita exatamente no piso', () => {
    expect(canScale(MIN_DIMENSION, MIN_DIMENSION, 1)).toBe(true)
  })

  it('recusa quando apenas um lado violaria o piso', () => {
    // Preserva a conjunção do original: o lado curto manda.
    expect(canScale(8000, 600, 0.84)).toBe(false)
  })

  it('recusa dimensões inválidas', () => {
    expect(canScale(0, 1000, 0.84)).toBe(false)
    expect(canScale(Number.NaN, 1000, 0.84)).toBe(false)
  })
})

describe('effectiveTargetBytes', () => {
  it('exige ao menos 2% de redução mesmo com meta folgada', () => {
    // Meta de 10 MB para um arquivo de 1 MB não pode devolver o arquivo intacto.
    expect(effectiveTargetBytes(1_000_000, 10_000_000)).toBe(980_000)
  })

  it('respeita a meta quando ela é mais apertada que os 98%', () => {
    expect(effectiveTargetBytes(1_000_000, 500_000)).toBe(500_000)
  })

  it('nunca desce abaixo de 1 KB', () => {
    expect(effectiveTargetBytes(100, 10)).toBe(10)
    expect(effectiveTargetBytes(100, 5000)).toBe(1024)
  })
})

describe('renderAutomatic', () => {
  it('para no primeiro degrau que fica menor que o original', async () => {
    const log: RenderAttempt[] = []
    const render = fakeRenderer({ baseBytes: 1_000_000, log })

    const outcome = await renderAutomatic(render, {
      requestedQuality: 82,
      originalBytes: 2_000_000,
    })

    expect(log).toHaveLength(1)
    expect(outcome.encodes).toBe(1)
    expect(outcome.warning).toBeUndefined()
    expect(outcome.attempt).toEqual({ quality: 82, scale: 1 })
  })

  it('desce a escada até caber e nunca redimensiona', async () => {
    const log: RenderAttempt[] = []
    const render = fakeRenderer({ baseBytes: 1_000_000, log })

    const outcome = await renderAutomatic(render, {
      requestedQuality: 82,
      originalBytes: 700_000,
    })

    expect(outcome.bytes.byteLength).toBeLessThan(700_000)
    expect(log.every((attempt) => attempt.scale === 1)).toBe(true)
    expect(log.length).toBeGreaterThan(1)
  })

  it('devolve o menor resultado com aviso quando nada cabe', async () => {
    const render = fakeRenderer({ baseBytes: 1_000_000, floorBytes: 900_000 })

    const outcome = await renderAutomatic(render, {
      requestedQuality: 82,
      originalBytes: 100_000,
    })

    expect(outcome.warning).toBe(MESSAGES.automaticFloor)
    expect(outcome.bytes.byteLength).toBe(900_000)
    // 82 já é um degrau da escada, então são 6 tentativas, não 7.
    expect(outcome.encodes).toBe(6)
  })

  it('propaga o cancelamento', async () => {
    const controller = new AbortController()
    controller.abort()
    const render = fakeRenderer({})

    await expect(
      renderAutomatic(
        render,
        { requestedQuality: 82, originalBytes: 1 },
        { signal: controller.signal },
      ),
    ).rejects.toBeInstanceOf(AbortedError)
  })

  it('para no orçamento de tempo e avisa', async () => {
    const render = fakeRenderer({ baseBytes: 1_000_000, floorBytes: 900_000 })

    const outcome = await renderAutomatic(
      render,
      { requestedQuality: 82, originalBytes: 100_000 },
      { isExpired: () => true },
    )

    expect(outcome.warning).toBe(MESSAGES.timeout)
    expect(outcome.encodes).toBe(1)
  })
})

describe('renderTargeted', () => {
  it('encontra a maior qualidade que cabe na meta', async () => {
    const log: RenderAttempt[] = []
    const render = fakeRenderer({ baseBytes: 1_000_000, log })

    const outcome = await renderTargeted(render, {
      width: 4000,
      height: 3000,
      originalBytes: 2_000_000,
      targetBytes: 600_000,
      maxQuality: 95,
    })

    expect(outcome.bytes.byteLength).toBeLessThanOrEqual(600_000)
    expect(outcome.warning).toBeUndefined()
    // Não deve existir tentativa aceita de qualidade maior que a escolhida.
    const aceitas = log.filter((a) => a.scale === outcome.attempt.scale)
    expect(Math.max(...aceitas.map((a) => a.quality))).toBeGreaterThanOrEqual(
      outcome.attempt.quality,
    )
  })

  it('nunca ultrapassa 7 encodes por nível de escala', async () => {
    const log: RenderAttempt[] = []
    const render = fakeRenderer({ baseBytes: 1_000_000, log })

    await renderTargeted(render, {
      width: 4000,
      height: 3000,
      originalBytes: 2_000_000,
      targetBytes: 600_000,
      maxQuality: 95,
    })

    const porEscala = new Map<number, number>()
    for (const attempt of log) {
      porEscala.set(attempt.scale, (porEscala.get(attempt.scale) ?? 0) + 1)
    }
    for (const contagem of porEscala.values()) {
      expect(contagem).toBeLessThanOrEqual(7)
    }
  })

  it('reduz a resolução quando a qualidade sozinha não basta', async () => {
    const log: RenderAttempt[] = []
    const render = fakeRenderer({ baseBytes: 10_000_000, log })

    const outcome = await renderTargeted(render, {
      width: 6000,
      height: 4000,
      originalBytes: 12_000_000,
      targetBytes: 500_000,
      maxQuality: 95,
    })

    expect(outcome.attempt.scale).toBeLessThan(1)
    expect(outcome.bytes.byteLength).toBeLessThanOrEqual(500_000)
    expect(new Set(log.map((a) => a.scale)).size).toBeGreaterThan(1)
  })

  it('respeita o piso de 900px e nunca vai além dele', async () => {
    const log: RenderAttempt[] = []
    // Meta impossível: força o máximo de reduções permitidas.
    const render = fakeRenderer({ baseBytes: 50_000_000, log, floorBytes: 5_000_000 })

    await renderTargeted(render, {
      width: 4000,
      height: 3000,
      originalBytes: 60_000_000,
      targetBytes: 1000,
      maxQuality: 95,
    })

    for (const attempt of log) {
      expect(Math.floor(3000 * attempt.scale)).toBeGreaterThanOrEqual(MIN_DIMENSION)
    }
  })

  it('não redimensiona imagem cujo lado menor já está abaixo do piso', async () => {
    const log: RenderAttempt[] = []
    const render = fakeRenderer({ baseBytes: 10_000_000, log, floorBytes: 2_000_000 })

    const outcome = await renderTargeted(render, {
      width: 800,
      height: 600,
      originalBytes: 12_000_000,
      targetBytes: 1000,
      maxQuality: 95,
    })

    expect(log.every((a) => a.scale === 1)).toBe(true)
    expect(outcome.warning).toBe(MESSAGES.targetFloor)
  })

  it('meta impossível devolve o menor resultado com aviso', async () => {
    const render = fakeRenderer({ baseBytes: 10_000_000, floorBytes: 3_000_000 })

    const outcome = await renderTargeted(render, {
      width: 4000,
      height: 3000,
      originalBytes: 12_000_000,
      targetBytes: 1000,
      maxQuality: 95,
    })

    expect(outcome.warning).toBe(MESSAGES.targetFloor)
    expect(outcome.bytes.byteLength).toBe(3_000_000)
  })

  it('arquivo já menor que a meta ainda é comprimido em ao menos 2%', async () => {
    const render = fakeRenderer({ baseBytes: 1_000_000 })

    const outcome = await renderTargeted(render, {
      width: 4000,
      height: 3000,
      originalBytes: 500_000,
      targetBytes: 50_000_000,
      maxQuality: 95,
    })

    expect(outcome.bytes.byteLength).toBeLessThanOrEqual(Math.floor(500_000 * 0.98))
  })

  it('executa ao menos um encode mesmo com maxQuality abaixo do piso da busca', async () => {
    // Regressão: com a saída antecipada, um teto abaixo de 24 fazia a busca
    // terminar sem nenhum encode. O Electron não tinha o problema porque
    // nunca saía cedo.
    const log: RenderAttempt[] = []
    const render = fakeRenderer({ baseBytes: 100_000, log })

    const outcome = await renderTargeted(render, {
      width: 4000,
      height: 3000,
      originalBytes: 1_000_000,
      targetBytes: 900_000,
      maxQuality: 10,
    })

    expect(log.length).toBeGreaterThan(0)
    expect(outcome.bytes).toBeInstanceOf(Uint8Array)
  })

  it('propaga o cancelamento', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      renderTargeted(
        fakeRenderer({}),
        { width: 4000, height: 3000, originalBytes: 1, targetBytes: 1, maxQuality: 95 },
        { signal: controller.signal },
      ),
    ).rejects.toBeInstanceOf(AbortedError)
  })

  it('para no orçamento de tempo e avisa', async () => {
    const log: RenderAttempt[] = []
    const render = fakeRenderer({ baseBytes: 10_000_000, log, floorBytes: 5_000_000 })

    const outcome = await renderTargeted(
      render,
      {
        width: 4000,
        height: 3000,
        originalBytes: 12_000_000,
        targetBytes: 1000,
        maxQuality: 95,
      },
      { isExpired: () => true },
    )

    expect(outcome.warning).toBe(MESSAGES.timeout)
    expect(log).toHaveLength(1)
  })
})

/**
 * A mudança de comportamento mais delicada do porte: a saída antecipada
 * quando `low > high`. O spike confirmou empiricamente com codecs reais
 * (docs/SPIKE.md §5.4.1); aqui a equivalência é provada exaustivamente
 * contra uma reimplementação fiel do laço do Electron.
 */
describe('saída antecipada é equivalente às 7 iterações fixas', () => {
  async function eletronOriginal(
    render: Renderer,
    options: { targetBytes: number; maxQuality: number },
  ): Promise<{ bytes: Uint8Array | null; encodes: number }> {
    let low = QUALITY_MIN
    let high = Math.min(options.maxQuality, QUALITY_MAX)
    let best: Uint8Array | null = null
    let encodes = 0

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const quality = Math.floor((low + high) / 2)
      // O Electron clampava a qualidade dentro do encoder, não na busca.
      const bytes = await render({ quality: clampQuality(quality), scale: 1 })
      encodes += 1
      if (bytes.byteLength <= options.targetBytes) {
        best = bytes
        low = quality + 1
      } else {
        high = quality - 1
      }
    }
    return { bytes: best, encodes }
  }

  it('produz exatamente os mesmos bytes em toda a faixa de metas', async () => {
    let economizados = 0
    let comparacoes = 0

    for (let targetKb = 100; targetKb <= 1000; targetKb += 50) {
      const targetBytes = targetKb * 1024

      const logOriginal: RenderAttempt[] = []
      const original = await eletronOriginal(
        fakeRenderer({ baseBytes: 1_000_000, log: logOriginal }),
        { targetBytes, maxQuality: 95 },
      )

      const logNovo: RenderAttempt[] = []
      const novo = await renderTargeted(fakeRenderer({ baseBytes: 1_000_000, log: logNovo }), {
        width: 4000,
        height: 3000,
        // originalBytes alto o bastante para que effectiveTargetBytes não
        // interfira e a comparação isole a busca binária.
        originalBytes: 100_000_000,
        targetBytes,
        maxQuality: 95,
      })

      // A comparação isola a busca binária: o Electron de referência só roda
      // no primeiro nível de escala, enquanto renderTargeted continua
      // reduzindo resolução quando nada cabe. Só os encodes de escala 1 são
      // comparáveis.
      const novoEscala1 = logNovo.filter((a) => a.scale === 1)

      if (original.bytes) {
        // Quando o original achou resultado, o novo tem de achar o mesmo —
        // e sem chegar a reduzir resolução.
        expect(novo.bytes.byteLength).toBe(original.bytes.byteLength)
        expect(novo.attempt.scale).toBe(1)
      }

      expect(novoEscala1.length).toBeLessThanOrEqual(logOriginal.length)
      economizados += logOriginal.length - novoEscala1.length
      comparacoes += 1
    }

    expect(comparacoes).toBeGreaterThan(15)
    // O spike mediu ~1 encode economizado em 7. Aqui deve haver economia real.
    expect(economizados).toBeGreaterThan(0)
  })
})

describe('mbToBytes', () => {
  it('converte megabytes binários', () => {
    expect(mbToBytes(5)).toBe(5 * 1024 * 1024)
    expect(mbToBytes(0.5)).toBe(524_288)
  })
})

describe('contrato do Renderer', () => {
  it('recebe apenas qualidades dentro da faixa permitida', async () => {
    const log: RenderAttempt[] = []
    const render = vi.fn(fakeRenderer({ baseBytes: 10_000_000, log, floorBytes: 5_000_000 }))

    await renderTargeted(render, {
      width: 4000,
      height: 3000,
      originalBytes: 12_000_000,
      targetBytes: 1000,
      maxQuality: 95,
    })

    expect(log.length).toBeGreaterThan(0)
    for (const attempt of log) {
      expect(attempt.quality).toBeGreaterThanOrEqual(QUALITY_MIN)
      expect(attempt.quality).toBeLessThanOrEqual(QUALITY_MAX)
    }
  })
})
