/**
 * O worker de ZIP — a ligação com `self`, e nada mais.
 *
 * Mesmo desenho do `image.worker.ts`: toda a lógica está em `zip-runner.ts`,
 * que roda em Node e é testado montando e descompactando um ZIP de verdade.
 */

import type { ZipWorkerRequest, ZipWorkerResponse } from './zip-protocol'
import { createZipRunner } from './zip-runner'

interface DedicatedWorkerScope {
  postMessage(message: ZipWorkerResponse): void
  addEventListener(type: 'message', listener: (event: MessageEvent<ZipWorkerRequest>) => void): void
}

const scope = globalThis as unknown as DedicatedWorkerScope

const runner = createZipRunner({
  post: (message) => {
    scope.postMessage(message)
  },
})

scope.addEventListener('message', (event) => {
  runner.handle(event.data)
})
