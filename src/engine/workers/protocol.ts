/**
 * O contrato entre a thread principal e os workers.
 *
 * Módulo folha de propósito: só tipos e funções puras. Ele é importado pelos
 * dois lados — pelo pool, que roda na thread principal, e pelo runner, que roda
 * dentro do worker — e importar qualquer coisa pesada aqui arrastaria os codecs
 * para o bundle inicial, que é justamente o que docs/HANDOFF.md §5 mediu para
 * garantir.
 *
 * **Nada de imagem é copiado nesta fronteira.** O `File` de entrada e o `Blob`
 * de saída são clonados por referência ao conteúdo — o navegador não duplica os
 * bytes, eles ficam no armazenamento de blobs. É o mesmo efeito prático dos
 * `Transferable` que docs/PLANO.md §1.1 pede, sem precisar destacar buffers.
 */

import type { FileMetadata, JobOptions, JobResult } from '@/engine/core/types'

/** Pede as dimensões sem processar — o orçamento do pool precisa delas antes. */
export interface ProbeRequest {
  type: 'probe'
  jobId: string
  file: File
}

export interface RunRequest {
  type: 'run'
  jobId: string
  file: File
  options: JobOptions
}

export interface AbortRequest {
  type: 'abort'
  jobId: string
}

export type WorkerRequest = ProbeRequest | RunRequest | AbortRequest

/** Primeira mensagem do worker: o módulo carregou e o listener está de pé. */
export interface ReadyMessage {
  type: 'ready'
}

export interface ProgressMessage {
  type: 'progress'
  jobId: string
  percent: number
}

export interface MetadataMessage {
  type: 'metadata'
  jobId: string
  metadata: FileMetadata
}

export interface DoneMessage {
  type: 'done'
  jobId: string
  result: JobResult
}

export interface CancelledMessage {
  type: 'cancelled'
  jobId: string
}

export interface FailedMessage {
  type: 'failed'
  jobId: string
  error: SerializedError
}

export type WorkerResponse =
  ReadyMessage | ProgressMessage | MetadataMessage | DoneMessage | CancelledMessage | FailedMessage

/**
 * Como o pool deve reagir a um erro:
 *
 * - `aborted` — o usuário cancelou. Não é falha, não retenta.
 * - `unsupported` — o arquivo não serve. Determinístico, retentar é desperdício.
 * - `failed` — qualquer outra coisa. **Retenta uma vez com worker novo**, que é
 *   a mitigação de docs/PLANO.md §2.2 para o `@jsquash/avif` que falhou uma vez
 *   no Firefox ao instanciar o módulo sob pressão de memória.
 */
export type JobErrorKind = 'aborted' | 'unsupported' | 'failed'

export interface SerializedError {
  kind: JobErrorKind
  name: string
  message: string
}

/**
 * Erro que cruza a fronteira do worker.
 *
 * Existe porque o `structuredClone` de um `Error` não preserva a subclasse: um
 * `AbortedError` chega do outro lado como `Error` comum, e o pool precisa
 * distinguir cancelamento de falha para decidir se retenta. O `kind` viaja
 * explicitamente em vez de depender do clone.
 */
export class JobError extends Error {
  readonly kind: JobErrorKind

  constructor(kind: JobErrorKind, message: string, name = 'JobError') {
    super(message)
    this.kind = kind
    this.name = name
  }

  static aborted(message = 'Operação cancelada.'): JobError {
    return new JobError('aborted', message, 'AbortedError')
  }
}

/** Nomes que significam cancelamento: o nosso e o `DOMException` do padrão. */
const ABORT_NAMES = new Set(['AbortedError', 'AbortError'])

export function serializeError(error: unknown): SerializedError {
  if (error instanceof JobError) {
    return { kind: error.kind, name: error.name, message: error.message }
  }

  if (error instanceof Error) {
    const kind: JobErrorKind = ABORT_NAMES.has(error.name)
      ? 'aborted'
      : error.name === 'UnsupportedInputError'
        ? 'unsupported'
        : 'failed'

    return { kind, name: error.name, message: error.message }
  }

  return { kind: 'failed', name: 'Error', message: String(error) }
}

export function toJobError(error: SerializedError): JobError {
  return new JobError(error.kind, error.message, error.name)
}

export function isAbortError(error: unknown): boolean {
  return error instanceof JobError
    ? error.kind === 'aborted'
    : error instanceof Error && ABORT_NAMES.has(error.name)
}

/**
 * O worker visto pelo pool.
 *
 * A interface existe para o pool não depender da classe `Worker`: nos testes
 * entra uma implementação em memória, e é assim que fila, orçamento,
 * cancelamento e retentativa são exercitados em Node, sem navegador. A fábrica
 * de verdade está em `spawn.ts`.
 */
export interface PoolWorkerHandle {
  post(message: WorkerRequest): void
  onMessage(handler: (message: WorkerResponse) => void): void
  /** Erro de carregamento ou morte do worker — o job em voo é retentado. */
  onError(handler: (error: unknown) => void): void
  terminate(): void
}

export type WorkerFactory = (index: number) => PoolWorkerHandle
