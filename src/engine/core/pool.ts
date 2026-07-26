/**
 * O pool de workers — ciclo de vida, despacho e cancelamento.
 *
 * Três responsabilidades, nesta ordem de importância:
 *
 * 1. **Despachar sob dois limites.** Um job só entra num worker se houver slot
 *    livre *e* orçamento de megapixels (`budget.ts`). A fila é estritamente
 *    FIFO: quando o primeiro da fila não cabe, ninguém passa na frente. Deixar
 *    os pequenos furarem a fila renderia mais vazão e faria a foto grande
 *    esperar indefinidamente enquanto o usuário vê o card parado.
 *
 * 2. **Cancelar de verdade.** Um encode individual não é interrompível: o
 *    worker checa o `signal` entre tentativas. Se ele não responder ao abort em
 *    2 s — porque está dentro de um AVIF longo — o worker é **terminado e
 *    substituído**. É o único jeito de o cancelamento ser imediato do ponto de
 *    vista de quem clicou (docs/PLANO.md §2.2).
 *
 * 3. **Sobreviver a worker morto.** Falha de execução vira uma retentativa com
 *    worker novo antes de virar erro. O motivo é concreto: o `@jsquash/avif`
 *    quebrou uma vez no Firefox ao instanciar o módulo sob pressão de memória e
 *    não reproduziu (docs/SPIKE.md, docs/PLANO.md §2.2).
 *
 * O pool nunca menciona `ImageEngine` nem `Worker`: recebe uma fábrica de
 * `PoolWorkerHandle`. É o que permite testar fila, orçamento, cancelamento e
 * retentativa em Node, sem navegador e sem WASM.
 */

import {
  JobError,
  toJobError,
  type PoolWorkerHandle,
  type WorkerFactory,
  type WorkerRequest,
  type WorkerResponse,
} from '@/engine/workers/protocol'
import { MegapixelBudget, megapixelBudget, readHardwareHints, workerCount } from './budget'
import type { FileMetadata, JobOptions, JobResult } from './types'

/** Espera por um cancelamento limpo antes de terminar o worker à força. */
export const DEFAULT_ABORT_GRACE_MS = 2_000
/** Uma execução mais uma retentativa. */
export const DEFAULT_MAX_ATTEMPTS = 2

export interface PoolRunTask {
  jobId: string
  file: File
  options: JobOptions
  /** Custo em megapixels, do `probe`. Zero quando desconhecido. */
  megapixels?: number
  /** Chamado quando o job entra de fato num worker, não ao ser enfileirado. */
  onStart?(): void
  onProgress?(percent: number): void
  signal?: AbortSignal
}

export interface PoolProbeTask {
  jobId: string
  signal?: AbortSignal
}

export interface PoolStats {
  size: number
  /** Slots ocupados agora. */
  active: number
  queued: number
  megapixelsInFlight: number
  megapixelBudget: number
}

export interface JobPool {
  readonly size: number
  probe(file: File, task: PoolProbeTask): Promise<FileMetadata>
  run(task: PoolRunTask): Promise<JobResult>
  stats(): PoolStats
  dispose(): void
}

export interface WorkerPoolOptions {
  createWorker: WorkerFactory
  /** Workers simultâneos. Padrão: `clamp(núcleos - 1, 1, 8)`. */
  size?: number
  /** Megapixels em voo. Padrão: derivado de `navigator.deviceMemory`. */
  megapixels?: number
  abortGraceMs?: number
  maxAttempts?: number
}

type DispatchRequest = Exclude<WorkerRequest, { type: 'abort' }>
type TaskValue = FileMetadata | JobResult

interface PendingTask {
  jobId: string
  cost: number
  request: DispatchRequest
  onStart: (() => void) | null
  onProgress: ((percent: number) => void) | null
  signal: AbortSignal | null
  onAbort: (() => void) | null
  /** Quantas vezes já foi despachado. Limitado por `maxAttempts`. */
  attempts: number
  slot: Slot | null
  settled: boolean
  resolve(value: TaskValue): void
  reject(reason: unknown): void
}

interface Slot {
  readonly index: number
  worker: PoolWorkerHandle | null
  task: PendingTask | null
  /** Megapixels reservados pelo job em voo — devolvidos ao liberar o slot. */
  reserved: number
  abortTimer: ReturnType<typeof setTimeout> | null
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'O worker falhou.'
}

export class WorkerPool implements JobPool {
  private readonly slots: Slot[]
  private readonly queue: PendingTask[] = []
  private readonly budget: MegapixelBudget
  private readonly createWorker: WorkerFactory
  private readonly abortGraceMs: number
  private readonly maxAttempts: number
  private disposed = false

  constructor(options: WorkerPoolOptions) {
    const hints = readHardwareHints()
    const size = Math.max(1, Math.floor(options.size ?? workerCount(hints)))

    this.createWorker = options.createWorker
    this.budget = new MegapixelBudget(options.megapixels ?? megapixelBudget(hints))
    this.abortGraceMs = options.abortGraceMs ?? DEFAULT_ABORT_GRACE_MS
    this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)

    // Os workers nascem sob demanda: abrir oito threads e carregar oito cópias
    // do runtime numa fila de um arquivo só seria desperdício visível.
    this.slots = Array.from({ length: size }, (_, index) => ({
      index,
      worker: null,
      task: null,
      reserved: 0,
      abortTimer: null,
    }))
  }

  get size(): number {
    return this.slots.length
  }

  /**
   * Dimensões sem processar, para o orçamento.
   *
   * Custa zero megapixels — é leitura de cabeçalho — mas roda no worker mesmo
   * assim: a regra estrutural de docs/PLANO.md §1.1 é que a thread principal
   * nunca toque em pixels, e o `probe` decodifica quando o cabeçalho é
   * ilegível. Aqui isso acontece longe da UI.
   */
  probe(file: File, task: PoolProbeTask): Promise<FileMetadata> {
    return this.enqueue({
      jobId: task.jobId,
      cost: 0,
      request: { type: 'probe', jobId: task.jobId, file },
      onStart: null,
      onProgress: null,
      signal: task.signal ?? null,
    }) as Promise<FileMetadata>
  }

  run(task: PoolRunTask): Promise<JobResult> {
    return this.enqueue({
      jobId: task.jobId,
      cost: task.megapixels ?? 0,
      request: { type: 'run', jobId: task.jobId, file: task.file, options: task.options },
      onStart: task.onStart ?? null,
      onProgress: task.onProgress ?? null,
      signal: task.signal ?? null,
    }) as Promise<JobResult>
  }

  stats(): PoolStats {
    return {
      size: this.slots.length,
      active: this.slots.filter((slot) => slot.task !== null).length,
      queued: this.queue.length,
      megapixelsInFlight: this.budget.inFlight,
      megapixelBudget: this.budget.total,
    }
  }

  dispose(): void {
    this.disposed = true

    for (const slot of this.slots) {
      this.discardWorker(slot)
      const task = this.releaseSlot(slot)
      if (task) this.rejectTask(task, JobError.aborted('Fila encerrada.'))
    }

    for (const task of this.queue.splice(0, this.queue.length)) {
      this.rejectTask(task, JobError.aborted('Fila encerrada.'))
    }
  }

  private enqueue(
    spec: Omit<PendingTask, 'attempts' | 'slot' | 'settled' | 'onAbort' | 'resolve' | 'reject'>,
  ): Promise<TaskValue> {
    if (this.disposed) {
      return Promise.reject(new JobError('failed', 'O pool já foi encerrado.'))
    }

    return new Promise<TaskValue>((resolve, reject) => {
      const task: PendingTask = {
        ...spec,
        attempts: 0,
        slot: null,
        settled: false,
        onAbort: null,
        resolve,
        reject,
      }

      if (task.signal?.aborted) {
        this.rejectTask(task, JobError.aborted())
        return
      }

      if (task.signal) {
        const onAbort = (): void => {
          this.abortTask(task)
        }
        task.onAbort = onAbort
        task.signal.addEventListener('abort', onAbort, { once: true })
      }

      this.queue.push(task)
      this.pump()
    })
  }

  private pump(): void {
    while (this.queue.length > 0) {
      const task = this.queue[0]
      if (!task) return

      // Cancelado enquanto esperava a vez, ou entre a retentativa e o despacho.
      if (task.signal?.aborted) {
        this.queue.shift()
        this.rejectTask(task, JobError.aborted())
        continue
      }

      const slot = this.slots.find((candidate) => candidate.task === null)
      if (!slot) return

      // FIFO estrito: o primeiro que não cabe segura a fila até algo liberar
      // orçamento. `tryReserve` aceita qualquer custo quando nada está em voo,
      // então um job maior que o orçamento inteiro roda sozinho em vez de
      // travar aqui para sempre.
      if (!this.budget.tryReserve(task.cost)) return

      this.queue.shift()
      this.dispatch(slot, task)
    }
  }

  private dispatch(slot: Slot, task: PendingTask): void {
    slot.task = task
    slot.reserved = task.cost
    task.slot = slot
    task.attempts += 1
    task.onStart?.()

    try {
      this.workerFor(slot).post(task.request)
    } catch (error) {
      // Falha ao criar o worker ou ao serializar a mensagem.
      this.handleWorkerFailure(slot, error)
    }
  }

  private workerFor(slot: Slot): PoolWorkerHandle {
    if (slot.worker) return slot.worker

    const worker = this.createWorker(slot.index)
    slot.worker = worker

    // A comparação de identidade descarta mensagens de um worker já substituído:
    // o slot é reutilizado, e um resultado atrasado do worker anterior seria
    // atribuído ao job errado.
    worker.onMessage((message) => {
      if (slot.worker !== worker) return
      this.onMessage(slot, message)
    })

    worker.onError((error) => {
      if (slot.worker !== worker) return
      this.handleWorkerFailure(slot, error)
    })

    return worker
  }

  private onMessage(slot: Slot, message: WorkerResponse): void {
    if (message.type === 'ready') return

    const task = slot.task
    // Mensagem sem dono: o abort venceu a corrida com o resultado, ou o job já
    // foi resolvido. Ignorar é o comportamento correto.
    if (!task || task.jobId !== message.jobId) return

    switch (message.type) {
      case 'progress':
        task.onProgress?.(message.percent)
        return

      case 'metadata':
        this.complete(slot, (settled) => {
          this.resolveTask(settled, message.metadata)
        })
        return

      case 'done':
        this.complete(slot, (settled) => {
          this.resolveTask(settled, message.result)
        })
        return

      case 'cancelled':
        this.complete(slot, (settled) => {
          this.rejectTask(settled, JobError.aborted())
        })
        return

      case 'failed':
        this.handleJobFailure(slot, task, toJobError(message.error))
        return
    }
  }

  /**
   * Falha reportada pelo worker. Cancelamento e arquivo não suportado são
   * definitivos; o resto ganha uma retentativa com worker novo, porque a
   * hipótese é estado ruim do módulo WASM e não defeito do arquivo.
   */
  private handleJobFailure(slot: Slot, task: PendingTask, error: JobError): void {
    if (error.kind !== 'failed' || task.attempts >= this.maxAttempts) {
      this.complete(slot, (settled) => {
        this.rejectTask(settled, error)
      })
      return
    }

    this.discardWorker(slot)
    this.complete(slot, (settled) => {
      // Volta para o **começo** da fila: quem já esperou não recomeça atrás.
      this.queue.unshift(settled)
    })
  }

  /** O worker morreu ou nunca subiu: o job em voo herda a política acima. */
  private handleWorkerFailure(slot: Slot, error: unknown): void {
    this.discardWorker(slot)

    const task = slot.task
    if (!task) {
      this.pump()
      return
    }

    this.handleJobFailure(
      slot,
      task,
      error instanceof JobError ? error : new JobError('failed', messageOf(error)),
    )
  }

  private abortTask(task: PendingTask): void {
    if (task.settled) return

    const slot = task.slot
    if (!slot) {
      const index = this.queue.indexOf(task)
      if (index !== -1) this.queue.splice(index, 1)
      this.rejectTask(task, JobError.aborted())
      return
    }

    if (slot.abortTimer !== null) return

    slot.worker?.post({ type: 'abort', jobId: task.jobId })

    slot.abortTimer = setTimeout(() => {
      // Passaram-se 2 s sem resposta: o worker está preso dentro de um encode,
      // que não dá para interromper. Termina, e o próximo job sobe um novo.
      this.discardWorker(slot)
      this.complete(slot, (settled) => {
        this.rejectTask(settled, JobError.aborted())
      })
    }, this.abortGraceMs)
  }

  private complete(slot: Slot, outcome: (task: PendingTask) => void): void {
    const task = this.releaseSlot(slot)
    if (task) outcome(task)
    this.pump()
  }

  /** Devolve o orçamento e desocupa o slot. Não resolve a promessa. */
  private releaseSlot(slot: Slot): PendingTask | null {
    if (slot.abortTimer !== null) {
      clearTimeout(slot.abortTimer)
      slot.abortTimer = null
    }

    this.budget.release(slot.reserved)
    slot.reserved = 0

    const task = slot.task
    slot.task = null
    if (task) task.slot = null
    return task
  }

  private discardWorker(slot: Slot): void {
    if (slot.abortTimer !== null) {
      clearTimeout(slot.abortTimer)
      slot.abortTimer = null
    }

    const worker = slot.worker
    slot.worker = null
    if (!worker) return

    try {
      worker.terminate()
    } catch {
      // Terminar um worker já morto não é problema de ninguém.
    }
  }

  private resolveTask(task: PendingTask, value: TaskValue): void {
    if (task.settled) return
    task.settled = true
    this.detach(task)
    task.resolve(value)
  }

  private rejectTask(task: PendingTask, error: unknown): void {
    if (task.settled) return
    task.settled = true
    this.detach(task)
    task.reject(error)
  }

  private detach(task: PendingTask): void {
    if (task.signal && task.onAbort) {
      task.signal.removeEventListener('abort', task.onAbort)
      task.onAbort = null
    }
  }
}
