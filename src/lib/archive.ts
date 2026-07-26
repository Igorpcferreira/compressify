/**
 * "Baixar tudo (.zip)" visto da thread principal.
 *
 * Tudo que este módulo faz é conversar com o worker de ZIP: manda os `Blob`,
 * recebe progresso e devolve um `Blob` só. Os bytes dos resultados **não são
 * lidos aqui** — quem chama `arrayBuffer()` é o worker. Montar 50 arquivos na
 * thread principal é exatamente o que o critério de aceite #4 proíbe.
 *
 * O worker é de uso único e sempre terminado no fim, inclusive quando dá erro
 * ou o usuário cancela. Um worker órfão segurando um lote de 500 MB é vazamento
 * que ninguém vê até a aba morrer.
 */

import { spawnZipWorker } from '@/engine/workers/spawn'
import type { ZipEntry, ZipWorkerRequest, ZipWorkerResponse } from '@/engine/workers/zip-protocol'

export type { ZipEntry }

export interface ArchiveOptions {
  onProgress?(percent: number): void
  signal?: AbortSignal
  /** Ponto de injeção dos testes. */
  spawn?: () => Worker
}

/** Cancelamento do usuário — não é falha, e a UI não deve mostrar erro. */
export class ArchiveCancelledError extends Error {
  constructor() {
    super('Compactação cancelada.')
    this.name = 'AbortedError'
  }
}

export function createZipArchive(
  entries: readonly ZipEntry[],
  options: ArchiveOptions = {},
): Promise<Blob> {
  if (entries.length === 0) {
    return Promise.reject(new Error('Nenhum arquivo pronto para baixar.'))
  }

  if (options.signal?.aborted) {
    return Promise.reject(new ArchiveCancelledError())
  }

  const id = 'zip'
  const worker = (options.spawn ?? spawnZipWorker)()

  return new Promise<Blob>((resolve, reject) => {
    let settled = false

    const finish = (action: () => void): void => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', onAbort)
      worker.terminate()
      action()
    }

    function onAbort(): void {
      // Pede a saída limpa e encerra do lado de cá na sequência: o worker de ZIP
      // não fica preso em nada longo, então não há prazo de tolerância como no
      // pool de imagem.
      worker.postMessage({ type: 'abort', id } satisfies ZipWorkerRequest)
      finish(() => reject(new ArchiveCancelledError()))
    }

    worker.addEventListener('message', (event: MessageEvent<ZipWorkerResponse>) => {
      const message = event.data
      if (message.id !== id) return

      switch (message.type) {
        case 'zip-progress':
          options.onProgress?.(message.percent)
          return
        case 'zip-done':
          finish(() => resolve(message.blob))
          return
        case 'zip-cancelled':
          finish(() => reject(new ArchiveCancelledError()))
          return
        case 'zip-failed':
          finish(() => reject(new Error(message.message)))
          return
      }
    })

    worker.addEventListener('error', (event) => {
      finish(() => reject(new Error(event.message || 'O worker de ZIP falhou.')))
    })

    options.signal?.addEventListener('abort', onAbort, { once: true })
    worker.postMessage({ type: 'zip', id, entries: [...entries] } satisfies ZipWorkerRequest)
  })
}
