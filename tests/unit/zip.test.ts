import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { ZipEntry, ZipWorkerResponse } from '@/engine/workers/zip-protocol'
import { createZipRunner } from '@/engine/workers/zip-runner'
import { flush } from '../helpers/workers'

/**
 * O runner de ZIP roda em Node sem adaptação, então estes testes montam um
 * arquivo de verdade e o **descompactam com o próprio fflate**. Conferir que
 * "não quebrou" seria fraco: o que interessa é que os bytes que saem são os
 * bytes que entraram, nos caminhos certos.
 */
function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

function entry(path: string, data: Uint8Array): ZipEntry {
  return { path, blob: new Blob([data.buffer as ArrayBuffer]) }
}

function runnerFor() {
  const sent: ZipWorkerResponse[] = []
  const runner = createZipRunner({ post: (message) => sent.push(message) })
  return { runner, sent }
}

async function unzip(message: ZipWorkerResponse | undefined): Promise<Record<string, Uint8Array>> {
  if (message?.type !== 'zip-done') throw new Error('o worker não devolveu um ZIP')
  return unzipSync(new Uint8Array(await message.blob.arrayBuffer()))
}

describe('createZipRunner', () => {
  it('monta um ZIP válido com os bytes intactos', async () => {
    const { runner, sent } = runnerFor()
    const a = bytes(1, 2, 3, 4, 5)
    const b = bytes(9, 8, 7)

    runner.handle({
      type: 'zip',
      id: 'zip',
      entries: [entry('a-compressify.webp', a), entry('b-compressify.png', b)],
    })
    await flush(20)

    const files = await unzip(sent.at(-1))
    expect(Object.keys(files).sort()).toEqual(['a-compressify.webp', 'b-compressify.png'])
    expect(files['a-compressify.webp']).toEqual(a)
    expect(files['b-compressify.png']).toEqual(b)
  })

  it('preserva a estrutura de subpastas', async () => {
    const { runner, sent } = runnerFor()

    runner.handle({
      type: 'zip',
      id: 'zip',
      entries: [
        entry('viagem/2026/praia-compressify.webp', bytes(1)),
        entry('viagem/capa-compressify.webp', bytes(2)),
      ],
    })
    await flush(20)

    const files = await unzip(sent.at(-1))
    expect(Object.keys(files).sort()).toEqual([
      'viagem/2026/praia-compressify.webp',
      'viagem/capa-compressify.webp',
    ])
  })

  it('guarda sem recomprimir — o conteúdo já saiu de um encoder', async () => {
    const { runner, sent } = runnerFor()
    // Bytes altamente compressíveis: com deflate o ZIP ficaria bem menor que a
    // entrada. Com "stored" ele fica maior, por causa dos cabeçalhos. É a prova
    // de que o método escolhido é o do `ZipPassThrough`.
    const repetitive = new Uint8Array(4096)

    runner.handle({ type: 'zip', id: 'zip', entries: [entry('foto-compressify.webp', repetitive)] })
    await flush(20)

    const message = sent.at(-1)
    if (message?.type !== 'zip-done') throw new Error('esperava zip-done')
    expect(message.blob.size).toBeGreaterThan(repetitive.byteLength)

    const files = await unzip(message)
    expect(files['foto-compressify.webp']?.byteLength).toBe(4096)
  })

  it('reporta progresso por arquivo', async () => {
    const { runner, sent } = runnerFor()

    runner.handle({
      type: 'zip',
      id: 'zip',
      entries: [entry('a.webp', bytes(1)), entry('b.webp', bytes(2)), entry('c.webp', bytes(3))],
    })
    await flush(20)

    const percentages = sent
      .filter((message) => message.type === 'zip-progress')
      .map((message) => message.percent)

    expect(percentages).toEqual([33, 67, 100])
  })

  it('para no cancelamento e não devolve arquivo', async () => {
    const { runner, sent } = runnerFor()

    runner.handle({
      type: 'zip',
      id: 'zip',
      entries: Array.from({ length: 20 }, (_, index) => entry(`f-${index}.webp`, bytes(index))),
    })
    runner.handle({ type: 'abort', id: 'zip' })
    await flush(30)

    expect(sent.some((message) => message.type === 'zip-done')).toBe(false)
    expect(sent.at(-1)?.type).toBe('zip-cancelled')
  })

  it('reporta falha em vez de ficar em silêncio', async () => {
    const { runner, sent } = runnerFor()
    const quebrado = {
      path: 'ruim.webp',
      blob: { arrayBuffer: () => Promise.reject(new Error('blob morreu')) } as unknown as Blob,
    }

    runner.handle({ type: 'zip', id: 'zip', entries: [quebrado] })
    await flush(20)

    expect(sent.at(-1)).toMatchObject({ type: 'zip-failed', message: 'blob morreu' })
  })

  it('ignora um cancelamento de outro lote', async () => {
    const { runner, sent } = runnerFor()

    runner.handle({ type: 'abort', id: 'outro' })
    runner.handle({ type: 'zip', id: 'zip', entries: [entry('a.webp', bytes(1))] })
    await flush(20)

    expect(sent.at(-1)?.type).toBe('zip-done')
  })
})
