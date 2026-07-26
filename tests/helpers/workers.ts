/**
 * Workers de mentira, dirigidos pelo teste.
 *
 * O pool nunca conhece a classe `Worker` — ele recebe uma fábrica de
 * `PoolWorkerHandle`. É o que permite exercitar em Node exatamente o que
 * importa: ordem de despacho, orçamento de memória, cancelamento com worker
 * travado e retentativa depois de falha. Nada disto precisa de navegador, e
 * tentar testá-lo com workers de verdade tornaria os testes não determinísticos.
 */

import type {
  PoolWorkerHandle,
  WorkerFactory,
  WorkerRequest,
  WorkerResponse,
} from '@/engine/workers/protocol'

export interface FakeWorkerHooks {
  /** Resposta automática a `probe`/`run`. Chamada num microtask, como o real. */
  onRequest?(request: WorkerRequest, worker: FakeWorker): void
}

export class FakeWorker implements PoolWorkerHandle {
  readonly requests: WorkerRequest[] = []
  terminated = false

  private messageHandler: ((message: WorkerResponse) => void) | null = null
  private errorHandler: ((error: unknown) => void) | null = null

  constructor(
    readonly index: number,
    private readonly hooks: FakeWorkerHooks = {},
  ) {}

  post(message: WorkerRequest): void {
    if (this.terminated) throw new Error('post em worker terminado')
    this.requests.push(message)

    const hook = this.hooks.onRequest
    if (!hook) return
    queueMicrotask(() => {
      if (!this.terminated) hook(message, this)
    })
  }

  onMessage(handler: (message: WorkerResponse) => void): void {
    this.messageHandler = handler
  }

  onError(handler: (error: unknown) => void): void {
    this.errorHandler = handler
  }

  terminate(): void {
    this.terminated = true
  }

  /** Uma mensagem do worker para o pool. */
  emit(message: WorkerResponse): void {
    this.messageHandler?.(message)
  }

  /** O worker morreu — o evento `error` do `Worker` real. */
  crash(error: unknown = new Error('worker morreu')): void {
    this.errorHandler?.(error)
  }

  get runs(): Array<Extract<WorkerRequest, { type: 'run' }>> {
    return this.requests.filter(
      (request): request is Extract<WorkerRequest, { type: 'run' }> => request.type === 'run',
    )
  }

  get aborts(): Array<Extract<WorkerRequest, { type: 'abort' }>> {
    return this.requests.filter(
      (request): request is Extract<WorkerRequest, { type: 'abort' }> => request.type === 'abort',
    )
  }
}

export interface FakeWorkerFleet {
  factory: WorkerFactory
  /** Na ordem de criação. Um slot que perde o worker cria outro no fim. */
  workers: FakeWorker[]
  /** O último worker criado para aquele slot. */
  forSlot(index: number): FakeWorker
}

export function fakeWorkerFleet(hooks: FakeWorkerHooks = {}): FakeWorkerFleet {
  const workers: FakeWorker[] = []

  return {
    workers,

    factory(index) {
      const worker = new FakeWorker(index, hooks)
      workers.push(worker)
      return worker
    },

    forSlot(index) {
      const found = [...workers].reverse().find((worker) => worker.index === index)
      if (!found) throw new Error(`nenhum worker criado para o slot ${index}`)
      return found
    },
  }
}

/** Espera a fila de microtasks drenar — o pool responde em microtasks. */
export async function flush(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
}

/** Espera de verdade, para os testes do prazo de 2 s do abort. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
