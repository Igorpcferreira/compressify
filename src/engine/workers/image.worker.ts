/**
 * O worker de imagem — a ligação com `self`, e nada mais.
 *
 * Tudo que dá para testar está em `runner.ts`. Este arquivo existe para ser o
 * ponto de entrada que o bundler reconhece em
 * `new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' })`,
 * e é aqui — e só aqui — que os codecs entram no grafo de módulos, pelo
 * registro padrão. Nenhum `.wasm` toca a thread principal.
 */

import { createDefaultRegistry } from '@/engine/core/registry'
import type { WorkerRequest, WorkerResponse } from './protocol'
import { createJobRunner } from './runner'

/**
 * O `tsconfig` carrega `dom` e `webworker` no mesmo programa, então o tipo de
 * `self` é ambíguo — o `postMessage` de `Window` pede `targetOrigin` e o de
 * worker não. Declarar a fatia que usamos é mais honesto do que um `any`, e
 * mantém as duas mensagens tipadas.
 */
interface DedicatedWorkerScope {
  postMessage(message: WorkerResponse): void
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void
}

const scope = globalThis as unknown as DedicatedWorkerScope

const runner = createJobRunner({
  registry: createDefaultRegistry(),
  post: (message) => {
    scope.postMessage(message)
  },
})

scope.addEventListener('message', (event) => {
  runner.handle(event.data)
})

scope.postMessage({ type: 'ready' })
