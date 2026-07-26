import { describe, expect, it } from 'vitest'
import { QueueOrchestrator } from '@/engine/core/orchestrator'
import type { JobPool, PoolRunTask, PoolStats } from '@/engine/core/pool'
import type { FileMetadata, JobResult } from '@/engine/core/types'
import { acceptImage } from '@/engine/image/support'
import { JobError } from '@/engine/workers/protocol'
import { createQueueStore, DEFAULT_OPTIONS, type QueueStore } from '@/store/queue'
import { imageFile } from '../helpers/images'
import { flush } from '../helpers/workers'

const metadata: FileMetadata = { width: 4000, height: 3000, format: 'jpeg', bytes: 1000 }

function jobResult(overrides: Partial<JobResult> = {}): JobResult {
  return {
    blob: new Blob([new Uint8Array(4)], { type: 'image/webp' }),
    outputName: 'foto-compressify.webp',
    originalBytes: 1000,
    compressedBytes: 250,
    savedBytes: 750,
    savedPercent: 75,
    status: 'success',
    width: 4000,
    height: 3000,
    ...overrides,
  }
}

interface FakePoolHooks {
  run?(task: PoolRunTask): Promise<JobResult>
}

/**
 * A store com o orquestrador de verdade e o pool trocado por um duplo.
 *
 * O orquestrador real entra no teste de propósito: o que interessa aqui é a
 * fiação — evento do motor virando estado — e testá-la contra um orquestrador
 * falso provaria apenas que o falso funciona.
 */
function storeWith(hooks: FakePoolHooks = {}): { store: QueueStore; runs: PoolRunTask[] } {
  const runs: PoolRunTask[] = []

  const pool: JobPool = {
    size: 2,
    probe: () => Promise.resolve(metadata),
    run(task) {
      runs.push(task)
      if (hooks.run) return hooks.run(task)
      task.onStart?.()
      return Promise.resolve(jobResult())
    },
    stats: (): PoolStats => ({
      size: 2,
      active: 0,
      queued: 0,
      megapixelsInFlight: 0,
      megapixelBudget: 96,
    }),
    dispose: () => {},
  }

  const store = createQueueStore({
    createOrchestrator: (events) => new QueueOrchestrator({ pool, accept: acceptImage, events }),
  })

  return { store, runs }
}

describe('store da fila — entrada', () => {
  it('enfileira o que tem motor e separa o que não tem', () => {
    const { store } = storeWith()

    store
      .getState()
      .addFiles([
        imageFile({ name: 'a.jpg', bytes: 1000 }),
        imageFile({ name: 'scan.tif', bytes: 500 }),
      ])

    const state = store.getState()
    expect(state.order).toHaveLength(1)
    expect(state.items[state.order[0] ?? '']).toMatchObject({
      name: 'a.jpg',
      status: 'queued',
      originalBytes: 1000,
      percent: 0,
    })
    expect(state.rejected[0]?.reason).toContain('não decodificam TIFF')
    expect(state.stats).toMatchObject({ total: 1, queued: 1, done: 0 })
  })

  it('mostra só o nome, mas guarda o caminho relativo', () => {
    const { store } = storeWith()
    store
      .getState()
      .addFiles([imageFile({ name: 'praia.jpg', relativePath: 'viagem/2026/praia.jpg' })])

    const item = Object.values(store.getState().items)[0]
    expect(item?.name).toBe('praia.jpg')
    expect(item?.path).toBe('viagem/2026/praia.jpg')
  })

  it('ignora uma chamada sem arquivos', () => {
    const { store } = storeWith()
    store.getState().addFiles([])
    expect(store.getState().order).toEqual([])
  })

  it('dispensa os avisos de recusa sem mexer na fila', () => {
    const { store } = storeWith()
    store.getState().addFiles([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.tiff' })])

    store.getState().dismissRejected()

    expect(store.getState().rejected).toEqual([])
    expect(store.getState().order).toHaveLength(1)
  })
})

describe('store da fila — execução', () => {
  it('leva o job de queued a success com os números do resultado', async () => {
    const { store, runs } = storeWith()
    store.getState().addFiles([imageFile({ name: 'a.jpg', bytes: 1000 })])

    await store.getState().start()

    const item = Object.values(store.getState().items)[0]
    expect(item).toMatchObject({
      status: 'success',
      percent: 100,
      compressedBytes: 250,
      savedPercent: 75,
      outputName: 'foto-compressify.webp',
    })
    expect(item?.blob).toBeInstanceOf(Blob)
    expect(item?.durationMs).not.toBeNull()
    expect(runs[0]?.megapixels).toBe(12)
    expect(store.getState().phase).toBe('idle')
    expect(store.getState().stats).toMatchObject({ done: 1, queued: 0 })
  })

  it('usa as opções escolhidas, não os padrões, na hora de rodar', async () => {
    const { store, runs } = storeWith()
    store.getState().addFiles([imageFile({ name: 'a.jpg' })])

    store.getState().setOptions({ mode: 'target', preset: 10, quality: 60 })
    await store.getState().start()

    expect(runs[0]?.options).toMatchObject({ mode: 'target', preset: 10, quality: 60 })
    expect(store.getState().options.outputFormat).toBe(DEFAULT_OPTIONS.outputFormat)
  })

  it('registra o aviso como estado próprio, separado de sucesso', async () => {
    const { store } = storeWith({
      run: (task) => {
        task.onStart?.()
        return Promise.resolve(
          jobResult({ status: 'warning', message: 'Não foi possível atingir a meta.' }),
        )
      },
    })
    store.getState().addFiles([imageFile({ name: 'a.jpg' })])

    await store.getState().start()

    expect(Object.values(store.getState().items)[0]).toMatchObject({
      status: 'warning',
      message: 'Não foi possível atingir a meta.',
    })
    // Aviso conta como concluído: o arquivo existe e é baixável.
    expect(store.getState().stats.done).toBe(1)
  })

  it('registra a falha sem derrubar o lote', async () => {
    const { store } = storeWith({
      run: (task) =>
        task.jobId.endsWith('1')
          ? Promise.reject(new JobError('failed', 'wasm morreu'))
          : Promise.resolve(jobResult()),
    })
    store.getState().addFiles([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.jpg' })])

    await store.getState().start()

    expect(store.getState().stats).toMatchObject({ done: 1, failed: 1 })
    expect(store.getState().items['job-1']).toMatchObject({
      status: 'error',
      message: 'wasm morreu',
    })
  })

  it('não roda duas vezes ao mesmo tempo', async () => {
    const { store, runs } = storeWith()
    store.getState().addFiles([imageFile({ name: 'a.jpg' })])

    const first = store.getState().start()
    await store.getState().start()
    await first

    expect(runs).toHaveLength(1)
  })

  it('não faz nada quando não há job na fila', async () => {
    const { store, runs } = storeWith()
    await store.getState().start()

    expect(runs).toHaveLength(0)
    expect(store.getState().phase).toBe('idle')
  })
})

describe('store da fila — a invariante de re-render', () => {
  it('progresso troca a referência de um item só', async () => {
    let report: (percent: number) => void = () => {}

    const { store } = storeWith({
      run: (task) =>
        new Promise((resolve) => {
          task.onStart?.()
          if (task.jobId === 'job-1') {
            report = (percent) => {
              task.onProgress?.(percent)
              resolve(jobResult())
            }
          } else {
            resolve(jobResult())
          }
        }),
    })

    store.getState().addFiles([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.jpg' })])
    const running = store.getState().start()
    await flush()

    const before = store.getState().items
    report(62)

    const after = store.getState().items
    // É isto que sustenta a escolha do Zustand em docs/PLANO.md §1.4: o card de
    // `job-2` assina o próprio item, e o item não mudou de referência, então ele
    // não repinta quando `job-1` anda 1%.
    expect(after['job-1']).not.toBe(before['job-1'])
    expect(after['job-2']).toBe(before['job-2'])
    expect(after['job-1']?.percent).toBe(62)

    await running
  })

  it('progresso não recalcula as estatísticas', async () => {
    let report: (percent: number) => void = () => {}

    const { store } = storeWith({
      run: (task) =>
        new Promise((resolve) => {
          task.onStart?.()
          report = (percent) => {
            task.onProgress?.(percent)
            resolve(jobResult())
          }
        }),
    })

    store.getState().addFiles([imageFile({ name: 'a.jpg' })])
    const running = store.getState().start()
    await flush()

    const before = store.getState().stats
    report(40)
    expect(store.getState().stats).toBe(before)

    await running
    // No desfecho, aí sim: o resumo muda.
    expect(store.getState().stats).not.toBe(before)
  })
})

describe('store da fila — cancelar e limpar', () => {
  it('cancela um job em voo', async () => {
    const { store } = storeWith({
      run: (task) =>
        new Promise((_resolve, reject) => {
          task.onStart?.()
          task.signal?.addEventListener('abort', () => reject(JobError.aborted()))
        }),
    })
    store.getState().addFiles([imageFile({ name: 'a.jpg' })])

    const running = store.getState().start()
    await flush()
    store.getState().cancelItem('job-1')
    await running

    expect(store.getState().items['job-1']?.status).toBe('cancelled')
    expect(store.getState().stats.cancelled).toBe(1)
  })

  it('cancela um job que nunca chegou a rodar', () => {
    const { store } = storeWith()
    store.getState().addFiles([imageFile({ name: 'a.jpg' })])

    store.getState().cancelItem('job-1')

    expect(store.getState().items['job-1']?.status).toBe('cancelled')
    expect(store.getState().stats).toMatchObject({ cancelled: 1, queued: 0 })
  })

  it('cancela a fila inteira no meio', async () => {
    const { store } = storeWith({
      run: (task) =>
        new Promise((_resolve, reject) => {
          task.onStart?.()
          task.signal?.addEventListener('abort', () => reject(JobError.aborted()))
        }),
    })
    store
      .getState()
      .addFiles([
        imageFile({ name: 'a.jpg' }),
        imageFile({ name: 'b.jpg' }),
        imageFile({ name: 'c.jpg' }),
      ])

    const running = store.getState().start()
    await flush()
    store.getState().cancelAll()
    await running

    expect(store.getState().stats.cancelled).toBe(3)
    expect(store.getState().phase).toBe('idle')
  })

  it('remove um item sem tocar nos outros', () => {
    const { store } = storeWith()
    store.getState().addFiles([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.jpg' })])

    store.getState().removeItem('job-1')

    expect(store.getState().order).toEqual(['job-2'])
    expect(store.getState().items['job-1']).toBeUndefined()
    expect(store.getState().stats.total).toBe(1)
  })

  it('limpar zera fila, resumo e recusas', async () => {
    const { store } = storeWith()
    store.getState().addFiles([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.tif' })])
    await store.getState().start()

    store.getState().clearQueue()

    expect(store.getState()).toMatchObject({
      order: [],
      items: {},
      rejected: [],
      lastSummary: null,
    })
    expect(store.getState().stats.total).toBe(0)
  })

  it('depois de limpar, o mesmo nome volta a sair sem índice', async () => {
    const { store } = storeWith()
    store.getState().addFiles([imageFile({ name: 'foto.jpg' })])
    await store.getState().start()
    store.getState().clearQueue()

    store.getState().addFiles([imageFile({ name: 'foto.jpg' })])
    await store.getState().start()

    expect(Object.values(store.getState().items)[0]?.outputName).toBe('foto-compressify.webp')
  })
})
