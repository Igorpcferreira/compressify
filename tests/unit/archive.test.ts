import { describe, expect, it } from 'vitest'
import type { ZipWorkerRequest, ZipWorkerResponse } from '@/engine/workers/zip-protocol'
import { ArchiveCancelledError, createZipArchive } from '@/lib/archive'
import { flush } from '../helpers/workers'

/**
 * O `archive.ts` é plumbing: manda os blobs, recebe progresso, devolve o ZIP.
 * A montagem de verdade tem seus próprios testes em `zip.test.ts`. O que
 * importa aqui é o que só se percebe quando dá errado — **o worker é sempre
 * terminado**, inclusive no erro e no cancelamento. Um worker órfão segurando
 * um lote de 500 MB é vazamento que ninguém vê até a aba morrer.
 */
class FakeZipWorker {
  readonly requests: ZipWorkerRequest[] = []
  terminated = false

  private messageHandlers: Array<(event: MessageEvent<ZipWorkerResponse>) => void> = []
  private errorHandlers: Array<(event: { message: string }) => void> = []

  postMessage(message: ZipWorkerRequest): void {
    this.requests.push(message)
  }

  addEventListener(type: string, handler: (event: never) => void): void {
    if (type === 'message') {
      this.messageHandlers.push(handler as (event: MessageEvent<ZipWorkerResponse>) => void)
    }
    if (type === 'error') this.errorHandlers.push(handler as (event: { message: string }) => void)
  }

  terminate(): void {
    this.terminated = true
  }

  emit(message: ZipWorkerResponse): void {
    for (const handler of this.messageHandlers) {
      handler({ data: message } as MessageEvent<ZipWorkerResponse>)
    }
  }

  crash(message = 'worker morreu'): void {
    for (const handler of this.errorHandlers) handler({ message })
  }
}

function archiveWith() {
  const worker = new FakeZipWorker()
  const entries = [{ path: 'a.webp', blob: new Blob(['a']) }]
  const promise = createZipArchive(entries, { spawn: () => worker as unknown as Worker })
  return { worker, promise }
}

describe('createZipArchive', () => {
  it('manda os arquivos e devolve o Blob do worker', async () => {
    const { worker, promise } = archiveWith()
    await flush()

    expect(worker.requests[0]).toMatchObject({ type: 'zip', id: 'zip' })

    const zip = new Blob(['PK'], { type: 'application/zip' })
    worker.emit({ type: 'zip-done', id: 'zip', blob: zip })

    await expect(promise).resolves.toBe(zip)
    expect(worker.terminated).toBe(true)
  })

  it('repassa o progresso', async () => {
    const worker = new FakeZipWorker()
    const percentages: number[] = []
    const promise = createZipArchive([{ path: 'a.webp', blob: new Blob(['a']) }], {
      spawn: () => worker as unknown as Worker,
      onProgress: (percent) => percentages.push(percent),
    })
    await flush()

    worker.emit({ type: 'zip-progress', id: 'zip', percent: 50 })
    worker.emit({ type: 'zip-done', id: 'zip', blob: new Blob(['PK']) })
    await promise

    expect(percentages).toEqual([50])
  })

  it('pede o abort ao worker e o termina quando o usuário cancela', async () => {
    const worker = new FakeZipWorker()
    const controller = new AbortController()
    const promise = createZipArchive([{ path: 'a.webp', blob: new Blob(['a']) }], {
      spawn: () => worker as unknown as Worker,
      signal: controller.signal,
    })
    await flush()

    controller.abort()

    await expect(promise).rejects.toBeInstanceOf(ArchiveCancelledError)
    expect(worker.requests.at(-1)).toMatchObject({ type: 'abort' })
    expect(worker.terminated).toBe(true)
  })

  it('rejeita com a mensagem do worker e termina', async () => {
    const { worker, promise } = archiveWith()
    await flush()

    worker.emit({ type: 'zip-failed', id: 'zip', message: 'sem memória' })

    await expect(promise).rejects.toThrow('sem memória')
    expect(worker.terminated).toBe(true)
  })

  it('trata a morte do worker como falha, sem ficar pendurado', async () => {
    const { worker, promise } = archiveWith()
    await flush()

    worker.crash('Out of memory')

    await expect(promise).rejects.toThrow('Out of memory')
    expect(worker.terminated).toBe(true)
  })

  it('ignora mensagem de outro lote', async () => {
    const { worker, promise } = archiveWith()
    await flush()

    worker.emit({ type: 'zip-done', id: 'outro', blob: new Blob(['X']) })
    worker.emit({ type: 'zip-done', id: 'zip', blob: new Blob(['PK']) })

    await expect(promise).resolves.toMatchObject({ size: 2 })
  })

  it('recusa lote vazio sem abrir worker', async () => {
    let spawned = 0
    await expect(
      createZipArchive([], {
        spawn: () => {
          spawned += 1
          return new FakeZipWorker() as unknown as Worker
        },
      }),
    ).rejects.toThrow('Nenhum arquivo pronto')

    expect(spawned).toBe(0)
  })

  it('nem abre o worker se o signal já veio abortado', async () => {
    let spawned = 0
    await expect(
      createZipArchive([{ path: 'a.webp', blob: new Blob(['a']) }], {
        signal: AbortSignal.abort(),
        spawn: () => {
          spawned += 1
          return new FakeZipWorker() as unknown as Worker
        },
      }),
    ).rejects.toBeInstanceOf(ArchiveCancelledError)

    expect(spawned).toBe(0)
  })
})
