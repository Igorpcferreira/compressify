/**
 * A fila — o que a UI conversa.
 *
 * O orquestrador é a única peça que vê o lote inteiro, e é por isso que três
 * responsabilidades moram aqui e não no pool:
 *
 * 1. **Aceitar ou recusar na entrada.** `supports()` é síncrono e puro; um
 *    `.tif` arrastado por engano vira mensagem explicativa na hora, sem gastar
 *    worker (docs/PLANO.md §3.5).
 *
 * 2. **Garantir que dois arquivos nunca disputem o mesmo nome de saída.** Cada
 *    worker tem sua própria instância de motor e seu próprio `Set` de nomes,
 *    então a unicidade global só pode ser resolvida aqui — é a dívida que
 *    docs/HANDOFF.md §6 deixou marcada para este incremento.
 *
 * 3. **Cancelar.** Um `AbortController` por job: cancelar um card aborta um
 *    job, cancelar a fila aborta todos. Quem ainda não foi despachado sai da
 *    fila sem tocar num worker.
 *
 * Ele não guarda estado de apresentação — isso é da store do Incremento 5. O
 * que ele mantém é o mínimo para saber o que ainda está em voo, e o que ele
 * emite são eventos.
 */

import { megapixelsOf } from './budget'
import { reserveUniquePath } from './naming'
import type { JobPool } from './pool'
import { createDefaultRegistry, unsupportedReason, type EngineRegistry } from './registry'
import type { FileMetadata, JobOptions, JobResult, JobStatus } from './types'
import { isAbortError } from '@/engine/workers/protocol'

export interface QueuedFile {
  id: string
  file: File
  /** Caminho relativo quando veio de uma pasta; o nome, caso contrário. */
  path: string
}

export interface RejectedFile {
  file: File
  reason: string
}

export interface AddResult {
  accepted: QueuedFile[]
  rejected: RejectedFile[]
}

export type JobOutcome =
  | { status: 'success' | 'warning'; result: JobResult }
  | { status: 'error'; message: string }
  | { status: 'cancelled' }

export interface RunSummary {
  total: number
  succeeded: number
  warned: number
  failed: number
  cancelled: number
  originalBytes: number
  compressedBytes: number
}

export interface OrchestratorEvents {
  onAccepted?(job: QueuedFile): void
  onRejected?(rejected: RejectedFile): void
  onMetadata?(id: string, metadata: FileMetadata): void
  /** O job entrou num worker — não confundir com "entrou na fila". */
  onStart?(id: string): void
  onProgress?(id: string, percent: number): void
  onSettled?(id: string, outcome: JobOutcome): void
  onIdle?(summary: RunSummary): void
}

export interface QueueJobView {
  id: string
  file: File
  path: string
  status: JobStatus
  percent: number
  metadata: FileMetadata | null
  result: JobResult | null
  message: string | null
}

export interface OrchestratorOptions {
  pool: JobPool
  registry?: EngineRegistry
  events?: OrchestratorEvents
}

interface Job extends QueueJobView {
  controller: AbortController | null
}

const FINAL_STATUSES = new Set<JobStatus>(['success', 'warning', 'error', 'cancelled'])

function pathOf(file: File): string {
  return file.webkitRelativePath || file.name
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class QueueOrchestrator {
  private readonly pool: JobPool
  private readonly registry: EngineRegistry
  private readonly events: OrchestratorEvents
  private readonly jobs = new Map<string, Job>()

  /**
   * Nomes de saída já reservados no lote. Vive aqui, e só aqui: é a garantia
   * que nenhum resultado sobrescreve outro no ZIP.
   */
  private readonly taken = new Set<string>()

  private sequence = 0
  private current: Promise<RunSummary> | null = null

  constructor(options: OrchestratorOptions) {
    this.pool = options.pool
    this.registry = options.registry ?? createDefaultRegistry()
    this.events = options.events ?? {}
  }

  get running(): boolean {
    return this.current !== null
  }

  jobList(): QueueJobView[] {
    return [...this.jobs.values()].map(({ controller: _controller, ...view }) => ({ ...view }))
  }

  /**
   * Enfileira o que algum motor aceita e devolve o resto com motivo.
   *
   * A recusa não é silenciosa de propósito: quem arrasta 50 arquivos e vê 48
   * cards precisa saber quais dois sumiram e por quê.
   */
  add(files: Iterable<File>): AddResult {
    const accepted: QueuedFile[] = []
    const rejected: RejectedFile[] = []

    for (const file of files) {
      if (!this.registry.resolve(file)) {
        const entry = { file, reason: unsupportedReason(file) }
        rejected.push(entry)
        this.events.onRejected?.(entry)
        continue
      }

      this.sequence += 1
      const job: Job = {
        id: `job-${this.sequence}`,
        file,
        path: pathOf(file),
        status: 'queued',
        percent: 0,
        metadata: null,
        result: null,
        message: null,
        controller: null,
      }

      this.jobs.set(job.id, job)
      const entry = { id: job.id, file, path: job.path }
      accepted.push(entry)
      this.events.onAccepted?.(entry)
    }

    return { accepted, rejected }
  }

  remove(id: string): void {
    this.cancel(id)
    this.jobs.delete(id)
  }

  /**
   * Esvazia a fila. Também zera os nomes reservados: limpar é começar um lote
   * novo, e a desambiguação por índice é por lote (docs/PLANO.md §3.1).
   */
  clear(): void {
    this.cancelAll()
    this.jobs.clear()
    this.taken.clear()
  }

  /**
   * Processa tudo que está `queued`.
   *
   * Todos os jobs são submetidos de uma vez: quem limita a concorrência é o
   * pool, que conhece os núcleos e o orçamento de memória. Chamar `run` com uma
   * execução em curso devolve a mesma promessa em vez de duplicar a fila.
   */
  run(options: JobOptions): Promise<RunSummary> {
    if (this.current) return this.current

    const pending = [...this.jobs.values()].filter((job) => job.status === 'queued')

    const finished = Promise.all(pending.map((job) => this.execute(job, options)))
      .then(() => this.summarize(pending))
      .then((summary) => {
        this.current = null
        this.events.onIdle?.(summary)
        return summary
      })

    this.current = finished
    return finished
  }

  cancel(id: string): void {
    const job = this.jobs.get(id)
    if (!job || FINAL_STATUSES.has(job.status)) return

    if (job.controller) {
      job.controller.abort()
      return
    }

    // Ainda não entrou numa execução: encerra sem passar pelo pool.
    this.settle(job, { status: 'cancelled' })
  }

  cancelAll(): void {
    for (const id of [...this.jobs.keys()]) this.cancel(id)
  }

  dispose(): void {
    this.cancelAll()
    this.pool.dispose()
  }

  private async execute(job: Job, options: JobOptions): Promise<void> {
    const controller = new AbortController()
    job.controller = controller

    try {
      const metadata = await this.probe(job, controller.signal)

      const result = await this.pool.run({
        jobId: job.id,
        file: job.file,
        options,
        megapixels: metadata ? megapixelsOf(metadata) : 0,
        onStart: () => {
          job.status = 'running'
          this.events.onStart?.(job.id)
        },
        onProgress: (percent) => {
          job.percent = percent
          this.events.onProgress?.(job.id, percent)
        },
        signal: controller.signal,
      })

      // A reserva final de nome. O motor dentro do worker já escolheu um, mas
      // com um `Set` que só enxerga aquele worker; aqui o lote inteiro é visto.
      const outputName = reserveUniquePath(result.outputName, this.taken)
      const settled = outputName === result.outputName ? result : { ...result, outputName }

      job.percent = 100
      job.result = settled
      this.settle(job, { status: settled.status, result: settled })
    } catch (error) {
      if (isAbortError(error)) {
        this.settle(job, { status: 'cancelled' })
      } else {
        this.settle(job, { status: 'error', message: messageOf(error) })
      }
    } finally {
      job.controller = null
    }
  }

  /**
   * Dimensões para o orçamento do pool.
   *
   * Cabeçalho ilegível não condena o job: sem dimensões o custo é zero e ele
   * apenas deixa de ser limitado pela memória — decidir se o arquivo presta é
   * do motor, no `process`.
   */
  private async probe(job: Job, signal: AbortSignal): Promise<FileMetadata | null> {
    try {
      const metadata = await this.pool.probe(job.file, { jobId: job.id, signal })
      job.metadata = metadata
      this.events.onMetadata?.(job.id, metadata)
      return metadata
    } catch (error) {
      if (isAbortError(error)) throw error
      return null
    }
  }

  private settle(job: Job, outcome: JobOutcome): void {
    if (FINAL_STATUSES.has(job.status)) return

    job.status = outcome.status
    job.message =
      outcome.status === 'error'
        ? outcome.message
        : outcome.status === 'cancelled'
          ? null
          : (outcome.result.message ?? null)

    this.events.onSettled?.(job.id, outcome)
  }

  private summarize(jobs: readonly Job[]): RunSummary {
    const summary: RunSummary = {
      total: jobs.length,
      succeeded: 0,
      warned: 0,
      failed: 0,
      cancelled: 0,
      originalBytes: 0,
      compressedBytes: 0,
    }

    for (const job of jobs) {
      switch (job.status) {
        case 'success':
          summary.succeeded += 1
          break
        case 'warning':
          summary.warned += 1
          break
        case 'cancelled':
          summary.cancelled += 1
          break
        case 'error':
          summary.failed += 1
          break
        case 'queued':
        case 'running':
          // Inalcançável: `run` só resume depois que todo job chegou a um
          // desfecho. Explícito para o dia em que deixar de ser verdade.
          break
      }

      if (job.result) {
        summary.originalBytes += job.result.originalBytes
        summary.compressedBytes += job.result.compressedBytes
      }
    }

    return summary
  }
}
