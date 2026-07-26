/**
 * A fábrica de workers de verdade.
 *
 * Isolada num módulo próprio por um motivo prático: é a única linha do projeto
 * que o bundler trata como ponto de entrada de worker, e tanto o Vite (dos
 * testes) quanto o webpack seguem o `new URL(…, import.meta.url)` na hora de
 * resolver módulos. Deixá-la dentro do `pool.ts` faria a suíte inteira arrastar
 * o grafo dos codecs só para testar aritmética de fila.
 *
 * Ninguém importa este arquivo além da raiz de composição da UI.
 */

import { WorkerPool, type WorkerPoolOptions } from '@/engine/core/pool'
import type { PoolWorkerHandle, WorkerRequest, WorkerResponse } from './protocol'

export function spawnImageWorker(): PoolWorkerHandle {
  const worker = new Worker(new URL('./image.worker.ts', import.meta.url), {
    type: 'module',
    name: 'compressify-image',
  })

  return {
    post(message: WorkerRequest) {
      worker.postMessage(message)
    },

    onMessage(handler: (message: WorkerResponse) => void) {
      worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
        handler(event.data)
      })
    },

    onError(handler: (error: unknown) => void) {
      // `error` cobre exceção não tratada e falha de carregamento do módulo;
      // `messageerror` cobre a mensagem que não pôde ser desserializada. Os dois
      // deixam o job em voo sem resposta, e o pool trata igual: worker novo e
      // uma retentativa.
      worker.addEventListener('error', (event) => {
        handler(event.error ?? new Error(event.message || 'Worker falhou.'))
      })
      worker.addEventListener('messageerror', () => {
        handler(new Error('Mensagem do worker não pôde ser lida.'))
      })
    },

    terminate() {
      worker.terminate()
    },
  }
}

/** O pool de produção, já ligado ao worker de imagem. */
export function createImagePool(options: Omit<WorkerPoolOptions, 'createWorker'> = {}): WorkerPool {
  return new WorkerPool({ ...options, createWorker: () => spawnImageWorker() })
}

/**
 * O worker de ZIP, cru.
 *
 * Sem `PoolWorkerHandle` de propósito: este não é do pool. Ele é de uso único —
 * nasce ao clicar em "Baixar tudo", entrega um `Blob` e é terminado. Envolvê-lo
 * na interface do pool sugeriria um ciclo de vida que ele não tem.
 */
export function spawnZipWorker(): Worker {
  return new Worker(new URL('./zip.worker.ts', import.meta.url), {
    type: 'module',
    name: 'compressify-zip',
  })
}
