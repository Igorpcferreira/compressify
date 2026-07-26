import { describe, expect, it } from 'vitest'
import { QueueOrchestrator } from '@/engine/core/orchestrator'
import type { JobPool, PoolRunTask, PoolStats } from '@/engine/core/pool'
import type { FileMetadata, JobOptions, JobResult } from '@/engine/core/types'
import { acceptImage } from '@/engine/image/support'
import { matchProfile, PROFILES } from '@/lib/profiles'
import { JobError } from '@/engine/workers/protocol'
import {
  createQueueStore,
  DEFAULT_OPTIONS,
  type QueueStore,
  type QueueStoreOptions,
} from '@/store/queue'
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
  archive?: QueueStoreOptions['archive']
  save?: QueueStoreOptions['save']
  canSaveToFolder?: boolean
}

/**
 * A store com o orquestrador de verdade e o pool trocado por um duplo.
 *
 * O orquestrador real entra no teste de propósito: o que interessa aqui é a
 * fiação — evento do motor virando estado — e testá-la contra um orquestrador
 * falso provaria apenas que o falso funciona.
 */
interface FakeStore {
  store: QueueStore
  runs: PoolRunTask[]
  downloads: Array<{ blob: Blob; name: string }>
}

function storeWith(hooks: FakePoolHooks = {}): FakeStore {
  const runs: PoolRunTask[] = []
  const downloads: Array<{ blob: Blob; name: string }> = []

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
    download: (blob, name) => downloads.push({ blob, name }),
    canSaveToFolder: () => hooks.canSaveToFolder ?? false,
    ...(hooks.archive ? { archive: hooks.archive } : {}),
    ...(hooks.save ? { save: hooks.save } : {}),
  })

  return { store, runs, downloads }
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

  it('aplica o par da landing: origem, destino e o modo converter', async () => {
    const { store, runs } = storeWith()
    store.getState().addFiles([imageFile({ name: 'a.jpg' })])

    store.getState().applyConversion({ from: 'jpeg', to: 'webp' })

    expect(store.getState().options).toMatchObject({ mode: 'convert', outputFormat: 'webp' })
    expect(store.getState().sourceFormat).toBe('jpeg')

    await store.getState().start()
    expect(runs[0]?.options).toMatchObject({ mode: 'convert', outputFormat: 'webp' })
  })

  it('conta o que destoa da origem — e não recusa nada', () => {
    // A regra do seletor: ele filtra a exibição, não o motor. Um PNG numa
    // página de "JPG para WebP" entra na fila do mesmo jeito, e a interface
    // ganha o número para poder dizer isso.
    const { store } = storeWith()
    store.getState().applyConversion({ from: 'jpeg', to: 'webp' })

    store
      .getState()
      .addFiles([
        imageFile({ name: 'a.jpg' }),
        imageFile({ name: 'b.png' }),
        imageFile({ name: 'c.webp' }),
      ])

    expect(store.getState().order).toHaveLength(3)
    expect(store.getState().rejected).toHaveLength(0)
    expect(store.getState().stats.foreign).toBe(2)

    // Trocar a origem recalcula na hora: a contagem é estado, não seletor.
    store.getState().setSourceFormat('png')
    expect(store.getState().stats.foreign).toBe(2)

    store.getState().setSourceFormat(null)
    expect(store.getState().stats.foreign).toBe(0)
  })

  it('mantém a contagem de origem coerente quando um item sai da fila', () => {
    const { store } = storeWith()
    store.getState().setSourceFormat('jpeg')
    store.getState().addFiles([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.png' })])

    expect(store.getState().stats.foreign).toBe(1)

    const png = store.getState().order.find((id) => store.getState().items[id]?.name === 'b.png')
    store.getState().removeItem(png ?? '')

    expect(store.getState().stats.foreign).toBe(0)
  })

  it('leva o modo converter até o orquestrador', async () => {
    // O modo novo não tem caminho próprio na store — e é justamente isso que
    // este teste prende: se um dia alguém filtrar modos aqui, a fila deixaria
    // de converter sem nenhum outro teste reclamar.
    const { store, runs } = storeWith()
    store.getState().addFiles([imageFile({ name: 'a.jpg' })])

    store.getState().setOptions({ mode: 'convert' })
    await store.getState().start()

    expect(runs[0]?.options.mode).toBe('convert')
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

describe('store da fila — saída', () => {
  async function withOneResult(hooks: FakePoolHooks = {}) {
    const fake = storeWith(hooks)
    fake.store.getState().addFiles([imageFile({ name: 'a.jpg' })])
    await fake.store.getState().start()
    return fake
  }

  it('baixa um arquivo pelo nome de saída, não pelo de entrada', async () => {
    const { store, downloads } = await withOneResult()

    store.getState().downloadItem('job-1')

    expect(downloads).toHaveLength(1)
    expect(downloads[0]?.name).toBe('foto-compressify.webp')
  })

  it('não baixa um job que não produziu arquivo', () => {
    const { store, downloads } = storeWith()
    store.getState().addFiles([imageFile({ name: 'a.jpg' })])

    store.getState().downloadItem('job-1')

    expect(downloads).toEqual([])
  })

  it('um resultado só vira download direto, não ZIP', async () => {
    let zipped = 0
    const { store, downloads } = await withOneResult({
      archive: () => {
        zipped += 1
        return Promise.resolve(new Blob(['PK']))
      },
    })

    await store.getState().downloadAll()

    // Obrigar a descompactar para pegar uma foto seria cerimônia sem ganho.
    expect(zipped).toBe(0)
    expect(downloads[0]?.name).toBe('foto-compressify.webp')
  })

  it('compacta o lote e baixa o ZIP com carimbo de data', async () => {
    const entries: string[] = []
    const fake = storeWith({
      archive: (received) => {
        entries.push(...received.map((entry) => entry.path))
        return Promise.resolve(new Blob(['PK'], { type: 'application/zip' }))
      },
    })

    fake.store.getState().addFiles([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.jpg' })])
    await fake.store.getState().start()
    await fake.store.getState().downloadAll()

    expect(entries).toEqual(['foto-compressify.webp', 'foto-compressify-1.webp'])
    expect(fake.downloads[0]?.name).toMatch(/^compressify-\d{8}-\d{4}\.zip$/)
    expect(fake.store.getState().output).toMatchObject({
      phase: 'idle',
      error: null,
      notice: '2 arquivos compactados.',
    })
  })

  it('mostra progresso enquanto compacta e volta a idle no fim', async () => {
    let report: (percent: number) => void = () => {}
    const fake = storeWith({
      archive: (_entries, options) =>
        new Promise((resolve) => {
          report = (percent) => {
            options.onProgress?.(percent)
            resolve(new Blob(['PK']))
          }
        }),
    })

    fake.store.getState().addFiles([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.jpg' })])
    await fake.store.getState().start()

    const zipping = fake.store.getState().downloadAll()
    await flush()
    expect(fake.store.getState().output.phase).toBe('zipping')

    report(60)
    await zipping
    expect(fake.store.getState().output).toMatchObject({ phase: 'idle', percent: 0 })
  })

  it('cancelar a compactação não vira erro na tela', async () => {
    const fake = storeWith({
      archive: (_entries, options) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            const error = new Error('Compactação cancelada.')
            error.name = 'AbortedError'
            reject(error)
          })
        }),
    })

    fake.store.getState().addFiles([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.jpg' })])
    await fake.store.getState().start()

    const zipping = fake.store.getState().downloadAll()
    await flush()
    fake.store.getState().cancelOutput()
    await zipping

    expect(fake.store.getState().output).toMatchObject({ phase: 'idle', error: null })
    expect(fake.downloads).toEqual([])
  })

  it('falha na compactação vira mensagem, não silêncio', async () => {
    const fake = storeWith({ archive: () => Promise.reject(new Error('sem memória')) })
    fake.store.getState().addFiles([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.jpg' })])
    await fake.store.getState().start()

    await fake.store.getState().downloadAll()

    expect(fake.store.getState().output.error).toBe('sem memória')

    fake.store.getState().dismissOutput()
    expect(fake.store.getState().output.error).toBeNull()
  })

  it('salva em pasta e confirma quantos arquivos foram escritos', async () => {
    const paths: string[] = []
    const { store } = await withOneResult({
      canSaveToFolder: true,
      save: (entries) => {
        paths.push(...entries.map((entry) => entry.path))
        return Promise.resolve({ directoryName: 'Downloads', written: entries.length })
      },
    })

    await store.getState().saveToFolder()

    expect(paths).toEqual(['foto-compressify.webp'])
    expect(store.getState().output.notice).toBe('1 arquivos salvos em Downloads.')
  })

  it('fechar o seletor de pasta não é erro', async () => {
    const { store } = await withOneResult({
      canSaveToFolder: true,
      save: () => {
        const error = new Error('Gravação cancelada.')
        error.name = 'AbortedError'
        return Promise.reject(error)
      },
    })

    await store.getState().saveToFolder()

    expect(store.getState().output).toMatchObject({ phase: 'idle', error: null, notice: null })
  })

  it('esconde "salvar em pasta" onde a API não existe', () => {
    expect(storeWith().store.getState().canSaveToFolder).toBe(false)
    expect(storeWith({ canSaveToFolder: true }).store.getState().canSaveToFolder).toBe(true)
  })

  it('não deixa duas saídas concorrerem', async () => {
    let calls = 0
    const fake = storeWith({
      archive: () => {
        calls += 1
        return new Promise(() => {})
      },
    })
    fake.store.getState().addFiles([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.jpg' })])
    await fake.store.getState().start()

    void fake.store.getState().downloadAll()
    await flush()
    void fake.store.getState().downloadAll()
    await flush()

    expect(calls).toBe(1)
  })

  it('limpar a fila cancela a saída em curso', async () => {
    let aborted = false
    const fake = storeWith({
      archive: (_entries, options) =>
        new Promise(() => {
          options.signal?.addEventListener('abort', () => {
            aborted = true
          })
        }),
    })
    fake.store.getState().addFiles([imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.jpg' })])
    await fake.store.getState().start()

    void fake.store.getState().downloadAll()
    await flush()
    fake.store.getState().clearQueue()

    expect(aborted).toBe(true)
    expect(fake.store.getState().output.phase).toBe('idle')
  })
})

/**
 * As preferências e os perfis.
 *
 * A store é o único lugar onde persistência e perfis se encontram, e o que
 * estes testes prendem é a fronteira: a leitura acontece **uma vez, sob
 * demanda** (nunca na criação da store, que roda durante a pré-renderização), e
 * a escrita acontece em toda mudança — sem que nenhuma das duas passe perto do
 * caminho quente do progresso.
 */
describe('store da fila — preferências', () => {
  function storeComPreferencias(guardadas?: Partial<JobOptions>) {
    const escritas: JobOptions[] = []
    const store = createQueueStore({
      createOrchestrator: (events) =>
        new QueueOrchestrator({
          pool: {
            size: 1,
            probe: () => Promise.resolve(metadata),
            run: (task) => {
              task.onStart?.()
              return Promise.resolve(jobResult())
            },
            stats: () => ({
              size: 1,
              active: 0,
              queued: 0,
              megapixelsInFlight: 0,
              megapixelBudget: 96,
            }),
            dispose: () => {},
          },
          accept: acceptImage,
          events,
        }),
      loadPreferences: () => ({ ...DEFAULT_OPTIONS, ...guardadas }),
      savePreferences: (options) => escritas.push(options),
    })

    return { store, escritas }
  }

  it('começa nos padrões e só lê o guardado quando mandam', () => {
    const { store } = storeComPreferencias({ quality: 41 })

    // Criar a store não pode tocar em `localStorage`: ela é criada na
    // importação do módulo, e o módulo é importado durante a pré-renderização
    // estática, onde `localStorage` não existe.
    expect(store.getState().options).toEqual(DEFAULT_OPTIONS)

    store.getState().hydratePreferences()
    expect(store.getState().options.quality).toBe(41)
  })

  it('persiste toda mudança de preferência', () => {
    const { store, escritas } = storeComPreferencias()

    store.getState().setOptions({ quality: 70 })
    store.getState().setOptions({ mode: 'target' })

    expect(escritas).toHaveLength(2)
    expect(escritas[1]).toMatchObject({ quality: 70, mode: 'target' })
  })

  it('aplicar um perfil troca as opções inteiras e persiste', () => {
    const { store, escritas } = storeComPreferencias()
    const web = PROFILES[0]
    if (!web) throw new Error('a lista de perfis não pode estar vazia')

    store.getState().setOptions({ customTargetMb: 3 })
    store.getState().applyProfile(web.id)

    // Substituição, não mesclagem: o `customTargetMb` de antes não pode
    // sobreviver escondido atrás de um perfil que não o menciona.
    expect(store.getState().options).toEqual(web.options)
    expect(matchProfile(store.getState().options)?.id).toBe(web.id)
    expect(escritas.at(-1)).toEqual(web.options)
  })

  it('ignora perfil desconhecido em vez de zerar as opções', () => {
    const { store } = storeComPreferencias()
    store.getState().setOptions({ quality: 51 })

    store.getState().applyProfile('perfil-que-nao-existe')

    expect(store.getState().options.quality).toBe(51)
  })

  it('não troca as preferências no meio de um lote', async () => {
    const { store } = storeComPreferencias({ quality: 41 })
    store.getState().addFiles([imageFile({ name: 'a.jpg' })])

    const rodando = store.getState().start()
    store.getState().hydratePreferences()
    await rodando

    // A hidratação roda na montagem, então isto não deve acontecer — mas se
    // acontecer, cards do mesmo lote sairiam com configurações diferentes.
    expect(store.getState().options.quality).toBe(DEFAULT_OPTIONS.quality)
  })
})
