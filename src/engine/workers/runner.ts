/**
 * O que o worker faz com cada mensagem — separado do próprio worker.
 *
 * `image.worker.ts` é só a ligação com `self`: quatro linhas que não dá para
 * testar em Node. Toda a lógica mora aqui, recebe o registro e a função de
 * envio por injeção, e é exercitada pelos testes com um registro falso. É a
 * mesma separação que faz o motor ser testável sem WASM (docs/HANDOFF.md §5) —
 * aplicada uma camada acima.
 */

import type { EngineRegistry } from '@/engine/core/registry'
import { unsupportedReason } from '@/engine/core/registry'
import type { CompressionEngine } from '@/engine/core/types'
import { serializeError, type WorkerRequest, type WorkerResponse } from './protocol'

export interface JobRunnerOptions {
  registry: EngineRegistry
  post(message: WorkerResponse): void
}

export interface JobRunner {
  handle(message: WorkerRequest): void
  /** Jobs em execução neste worker. Um, na prática — o pool despacha um por vez. */
  readonly active: number
}

/** O arquivo não tem motor: erro explicativo, não silêncio. */
class UnsupportedFileError extends Error {
  constructor(file: File) {
    super(unsupportedReason(file))
    this.name = 'UnsupportedInputError'
  }
}

export function createJobRunner({ registry, post }: JobRunnerOptions): JobRunner {
  const controllers = new Map<string, AbortController>()

  function engineFor(file: File): CompressionEngine {
    const engine = registry.resolve(file)
    if (!engine) throw new UnsupportedFileError(file)
    return engine
  }

  function fail(jobId: string, error: unknown): void {
    const serialized = serializeError(error)

    if (serialized.kind === 'aborted') {
      post({ type: 'cancelled', jobId })
      return
    }

    post({ type: 'failed', jobId, error: serialized })
  }

  async function probe(jobId: string, file: File): Promise<void> {
    try {
      const metadata = await engineFor(file).probe(file)
      post({ type: 'metadata', jobId, metadata })
    } catch (error) {
      fail(jobId, error)
    }
  }

  async function run(message: Extract<WorkerRequest, { type: 'run' }>): Promise<void> {
    const { jobId, file, options } = message
    const controller = new AbortController()
    controllers.set(jobId, controller)

    try {
      const result = await engineFor(file).process(file, options, {
        onProgress(percent) {
          post({ type: 'progress', jobId, percent })
        },
        signal: controller.signal,
      })

      // O abort pode ter chegado durante o último encode — um encode isolado não
      // é interrompível (docs/PLANO.md §2.2), então o resultado existe mas não
      // interessa mais. Reportar `done` aqui deixaria um card cancelado voltar
      // a "concluído" e o pool contaria um job que ninguém está esperando.
      if (controller.signal.aborted) {
        post({ type: 'cancelled', jobId })
        return
      }

      post({ type: 'done', jobId, result })
    } catch (error) {
      fail(jobId, error)
    } finally {
      controllers.delete(jobId)
    }
  }

  return {
    handle(message) {
      switch (message.type) {
        case 'probe':
          void probe(message.jobId, message.file)
          return

        case 'run':
          void run(message)
          return

        case 'abort':
          controllers.get(message.jobId)?.abort()
          return
      }
    },

    get active() {
      return controllers.size
    },
  }
}
