import { describe, expect, it } from 'vitest'
import { QueueOrchestrator, type JobOutcome } from '@/engine/core/orchestrator'
import type { JobPool, PoolProbeTask, PoolRunTask, PoolStats } from '@/engine/core/pool'
import type { FileMetadata, JobOptions, JobResult } from '@/engine/core/types'
import { JobError } from '@/engine/workers/protocol'
import { imageFile, jpegHeader } from '../helpers/images'
import { flush } from '../helpers/workers'

const options: JobOptions = {
  mode: 'auto',
  preset: 5,
  outputFormat: 'smart',
  quality: 82,
}

function jobResult(overrides: Partial<JobResult> = {}): JobResult {
  return {
    blob: new Blob([new Uint8Array(4)], { type: 'image/webp' }),
    outputName: 'foto-compressify.webp',
    originalBytes: 1000,
    compressedBytes: 400,
    savedBytes: 600,
    savedPercent: 60,
    status: 'success',
    width: 100,
    height: 100,
    ...overrides,
  }
}

interface FakePoolOptions {
  probe?(file: File, task: PoolProbeTask): Promise<FileMetadata>
  run?(task: PoolRunTask): Promise<JobResult>
}

/**
 * O pool visto pelo orquestrador. Trocá-lo por um duplo isola o que está sob
 * teste aqui: aceitação na entrada, nomes únicos no lote, cancelamento e
 * contagem final. A mecânica de fila e memória tem seus próprios testes.
 */
function fakePool(overrides: FakePoolOptions = {}) {
  const runs: PoolRunTask[] = []
  let disposed = false

  const pool: JobPool = {
    size: 4,

    probe(file, task) {
      return (
        overrides.probe?.(file, task) ??
        Promise.resolve<FileMetadata>({
          width: 4000,
          height: 3000,
          format: 'jpeg',
          bytes: file.size,
        })
      )
    },

    run(task) {
      runs.push(task)
      if (overrides.run) return overrides.run(task)
      task.onStart?.()
      return Promise.resolve(jobResult())
    },

    stats(): PoolStats {
      return {
        size: 4,
        active: 0,
        queued: 0,
        megapixelsInFlight: 0,
        megapixelBudget: 96,
      }
    },

    dispose() {
      disposed = true
    },
  }

  return {
    pool,
    runs,
    get disposed() {
      return disposed
    },
  }
}

describe('QueueOrchestrator — entrada', () => {
  it('aceita o que tem motor e recusa o resto com motivo', () => {
    const orchestrator = new QueueOrchestrator({ pool: fakePool().pool })

    const { accepted, rejected } = orchestrator.add([
      imageFile({ name: 'foto.jpg' }),
      imageFile({ name: 'arte.png' }),
      imageFile({ name: 'scan.tif' }),
    ])

    expect(accepted.map((job) => job.path)).toEqual(['foto.jpg', 'arte.png'])
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toContain('não decodificam TIFF')
  })

  it('preserva o caminho relativo de quem veio de uma pasta', () => {
    const orchestrator = new QueueOrchestrator({ pool: fakePool().pool })

    const { accepted } = orchestrator.add([
      imageFile({ name: 'praia.jpg', relativePath: 'viagem/2026/praia.jpg' }),
    ])

    expect(accepted[0]?.path).toBe('viagem/2026/praia.jpg')
  })

  it('emite os eventos de aceitação e recusa', () => {
    const events: string[] = []
    const orchestrator = new QueueOrchestrator({
      pool: fakePool().pool,
      events: {
        onAccepted: (job) => events.push(`aceito:${job.path}`),
        onRejected: (rejected) => events.push(`recusado:${rejected.file.name}`),
      },
    })

    orchestrator.add([imageFile({ name: 'foto.jpg' }), imageFile({ name: 'scan.tiff' })])

    expect(events).toEqual(['aceito:foto.jpg', 'recusado:scan.tiff'])
  })
})

describe('QueueOrchestrator — execução', () => {
  it('processa a fila e resume o lote', async () => {
    const orchestrator = new QueueOrchestrator({ pool: fakePool().pool })
    orchestrator.add([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.jpg' })])

    const summary = await orchestrator.run(options)

    expect(summary).toMatchObject({
      total: 2,
      succeeded: 2,
      failed: 0,
      cancelled: 0,
      originalBytes: 2000,
      compressedBytes: 800,
    })
  })

  it('passa o custo em megapixels vindo do probe', async () => {
    const fake = fakePool()
    const orchestrator = new QueueOrchestrator({ pool: fake.pool })
    orchestrator.add([
      imageFile({ name: 'a.jpg', header: jpegHeader({ width: 4000, height: 3000 }) }),
    ])

    await orchestrator.run(options)

    expect(fake.runs[0]?.megapixels).toBe(12)
  })

  it('segue sem orçamento quando o probe falha', async () => {
    const fake = fakePool({ probe: () => Promise.reject(new Error('cabeçalho ilegível')) })
    const orchestrator = new QueueOrchestrator({ pool: fake.pool })
    orchestrator.add([imageFile({ name: 'a.jpg' })])

    const summary = await orchestrator.run(options)

    // Cabeçalho ilegível não condena o arquivo: quem decide é o motor.
    expect(fake.runs[0]?.megapixels).toBe(0)
    expect(summary.succeeded).toBe(1)
  })

  it('emite metadata, start, progress e o desfecho na ordem', async () => {
    const events: string[] = []
    const fake = fakePool({
      run: (task) => {
        task.onStart?.()
        task.onProgress?.(10)
        task.onProgress?.(100)
        return Promise.resolve(jobResult())
      },
    })

    const orchestrator = new QueueOrchestrator({
      pool: fake.pool,
      events: {
        onMetadata: () => events.push('metadata'),
        onStart: () => events.push('start'),
        onProgress: (_id, percent) => events.push(`progress:${percent}`),
        onSettled: (_id, outcome) => events.push(`settled:${outcome.status}`),
        onIdle: () => events.push('idle'),
      },
    })

    orchestrator.add([imageFile({ name: 'a.jpg' })])
    await orchestrator.run(options)

    expect(events).toEqual([
      'metadata',
      'start',
      'progress:10',
      'progress:100',
      'settled:success',
      'idle',
    ])
  })

  it('conta aviso separado de sucesso', async () => {
    const fake = fakePool({
      run: () =>
        Promise.resolve(
          jobResult({ status: 'warning', message: 'Não foi possível atingir a meta.' }),
        ),
    })
    const orchestrator = new QueueOrchestrator({ pool: fake.pool })
    orchestrator.add([imageFile({ name: 'a.jpg' })])

    const summary = await orchestrator.run(options)

    expect(summary).toMatchObject({ succeeded: 0, warned: 1 })
    expect(orchestrator.jobList()[0]).toMatchObject({
      status: 'warning',
      message: 'Não foi possível atingir a meta.',
    })
  })

  it('registra falha sem derrubar o resto do lote', async () => {
    const fake = fakePool({
      run: (task) =>
        task.jobId.endsWith('1')
          ? Promise.reject(new JobError('failed', 'wasm morreu'))
          : Promise.resolve(jobResult()),
    })
    const orchestrator = new QueueOrchestrator({ pool: fake.pool })
    orchestrator.add([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.jpg' })])

    const summary = await orchestrator.run(options)

    expect(summary).toMatchObject({ total: 2, succeeded: 1, failed: 1 })
    expect(orchestrator.jobList()[0]).toMatchObject({ status: 'error', message: 'wasm morreu' })
  })

  it('devolve a mesma execução quando run é chamado duas vezes', async () => {
    const fake = fakePool()
    const orchestrator = new QueueOrchestrator({ pool: fake.pool })
    orchestrator.add([imageFile({ name: 'a.jpg' })])

    const first = orchestrator.run(options)
    const second = orchestrator.run(options)

    expect(second).toBe(first)
    await first
    expect(fake.runs).toHaveLength(1)
  })
})

describe('QueueOrchestrator — nomes de saída', () => {
  it('desambigua entre workers que não se enxergam', async () => {
    // Dois `foto.jpg` de origens diferentes, cada um num worker com seu próprio
    // `Set` de nomes: os dois voltam com o mesmo nome. Só a thread principal vê
    // o lote inteiro — docs/HANDOFF.md §6.
    const fake = fakePool({ run: () => Promise.resolve(jobResult()) })
    const orchestrator = new QueueOrchestrator({ pool: fake.pool })
    orchestrator.add([imageFile({ name: 'foto.jpg' }), imageFile({ name: 'foto.jpg' })])

    await orchestrator.run(options)

    const names = orchestrator.jobList().map((job) => job.result?.outputName)
    expect(names).toEqual(['foto-compressify.webp', 'foto-compressify-1.webp'])
  })

  it('não renomeia quem já veio único', async () => {
    const fake = fakePool({
      run: (task) => Promise.resolve(jobResult({ outputName: `${task.jobId}-compressify.webp` })),
    })
    const orchestrator = new QueueOrchestrator({ pool: fake.pool })
    orchestrator.add([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.jpg' })])

    await orchestrator.run(options)

    expect(orchestrator.jobList().map((job) => job.result?.outputName)).toEqual([
      'job-1-compressify.webp',
      'job-2-compressify.webp',
    ])
  })

  it('respeita a pasta ao desambiguar', async () => {
    const fake = fakePool({
      run: (task) =>
        Promise.resolve(
          jobResult({
            outputName:
              task.jobId === 'job-1' ? 'viagem/foto-compressify.webp' : 'foto-compressify.webp',
          }),
        ),
    })
    const orchestrator = new QueueOrchestrator({ pool: fake.pool })
    orchestrator.add([
      imageFile({ name: 'foto.jpg', relativePath: 'viagem/foto.jpg' }),
      imageFile({ name: 'foto.jpg' }),
    ])

    await orchestrator.run(options)

    // Pastas diferentes não colidem: nada é renomeado.
    expect(orchestrator.jobList().map((job) => job.result?.outputName)).toEqual([
      'viagem/foto-compressify.webp',
      'foto-compressify.webp',
    ])
  })

  it('libera os nomes ao limpar a fila — a desambiguação é por lote', async () => {
    const fake = fakePool()
    const orchestrator = new QueueOrchestrator({ pool: fake.pool })

    orchestrator.add([imageFile({ name: 'foto.jpg' })])
    await orchestrator.run(options)

    orchestrator.clear()
    orchestrator.add([imageFile({ name: 'foto.jpg' })])
    await orchestrator.run(options)

    expect(orchestrator.jobList()[0]?.result?.outputName).toBe('foto-compressify.webp')
  })
})

describe('QueueOrchestrator — cancelamento', () => {
  it('cancela um job em voo pelo id', async () => {
    const outcomes: JobOutcome[] = []
    const fake = fakePool({
      run: (task) =>
        new Promise((_resolve, reject) => {
          task.onStart?.()
          task.signal?.addEventListener('abort', () => reject(JobError.aborted()))
        }),
    })

    const orchestrator = new QueueOrchestrator({
      pool: fake.pool,
      events: { onSettled: (_id, outcome) => outcomes.push(outcome) },
    })
    const { accepted } = orchestrator.add([imageFile({ name: 'a.jpg' })])

    const running = orchestrator.run(options)
    await flush()

    orchestrator.cancel(accepted[0]?.id ?? '')
    const summary = await running

    expect(summary).toMatchObject({ cancelled: 1, succeeded: 0 })
    expect(outcomes).toEqual([{ status: 'cancelled' }])
  })

  it('cancela a fila inteira no meio', async () => {
    const fake = fakePool({
      run: (task) =>
        new Promise((_resolve, reject) => {
          task.onStart?.()
          task.signal?.addEventListener('abort', () => reject(JobError.aborted()))
        }),
    })
    const orchestrator = new QueueOrchestrator({ pool: fake.pool })
    orchestrator.add([
      imageFile({ name: 'a.jpg' }),
      imageFile({ name: 'b.jpg' }),
      imageFile({ name: 'c.jpg' }),
    ])

    const running = orchestrator.run(options)
    await flush()
    orchestrator.cancelAll()

    await expect(running).resolves.toMatchObject({ total: 3, cancelled: 3 })
    expect(orchestrator.jobList().every((job) => job.status === 'cancelled')).toBe(true)
  })

  it('cancela quem nunca chegou a rodar', () => {
    const orchestrator = new QueueOrchestrator({ pool: fakePool().pool })
    const { accepted } = orchestrator.add([imageFile({ name: 'a.jpg' })])

    orchestrator.cancel(accepted[0]?.id ?? '')

    expect(orchestrator.jobList()[0]?.status).toBe('cancelled')
  })

  it('não reabre um job já concluído', async () => {
    const fake = fakePool()
    const orchestrator = new QueueOrchestrator({ pool: fake.pool })
    const { accepted } = orchestrator.add([imageFile({ name: 'a.jpg' })])

    await orchestrator.run(options)
    orchestrator.cancel(accepted[0]?.id ?? '')

    expect(orchestrator.jobList()[0]?.status).toBe('success')
  })

  it('dispose encerra o pool', () => {
    const fake = fakePool()
    const orchestrator = new QueueOrchestrator({ pool: fake.pool })

    orchestrator.dispose()

    expect(fake.disposed).toBe(true)
  })
})
