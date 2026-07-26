import { describe, expect, it } from 'vitest'
import { WorkerPool } from '@/engine/core/pool'
import type { JobOptions, JobResult } from '@/engine/core/types'
import { JobError } from '@/engine/workers/protocol'
import { imageFile } from '../helpers/images'
import { fakeWorkerFleet, flush, sleep } from '../helpers/workers'

const options: JobOptions = {
  mode: 'auto',
  preset: 5,
  outputFormat: 'smart',
  quality: 82,
}

function result(outputName: string): JobResult {
  return {
    blob: new Blob([new Uint8Array(10)], { type: 'image/webp' }),
    outputName,
    originalBytes: 100,
    compressedBytes: 10,
    savedBytes: 90,
    savedPercent: 90,
    status: 'success',
    width: 100,
    height: 100,
  }
}

function runTask(pool: WorkerPool, jobId: string, extra: { megapixels?: number } = {}) {
  return pool.run({
    jobId,
    file: imageFile({ name: `${jobId}.jpg` }),
    options,
    ...extra,
  })
}

describe('WorkerPool — despacho', () => {
  it('ocupa um slot por job e enfileira o excedente', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 2, megapixels: 1000 })

    const jobs = [runTask(pool, 'a'), runTask(pool, 'b'), runTask(pool, 'c')]
    await flush()

    expect(pool.stats()).toMatchObject({ size: 2, active: 2, queued: 1 })
    expect(fleet.workers).toHaveLength(2)

    fleet.forSlot(0).emit({ type: 'done', jobId: 'a', result: result('a.webp') })
    await flush()

    // O terceiro entra no slot que vagou, e reaproveita o mesmo worker.
    expect(fleet.workers).toHaveLength(2)
    expect(fleet.forSlot(0).runs.map((run) => run.jobId)).toEqual(['a', 'c'])

    fleet.forSlot(0).emit({ type: 'done', jobId: 'c', result: result('c.webp') })
    fleet.forSlot(1).emit({ type: 'done', jobId: 'b', result: result('b.webp') })

    const settled = await Promise.all(jobs)
    expect(settled.map((job) => job.outputName)).toEqual(['a.webp', 'b.webp', 'c.webp'])
  })

  it('cria os workers sob demanda, não na construção', () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 4 })

    expect(pool.size).toBe(4)
    expect(fleet.workers).toHaveLength(0)
  })

  it('segura o despacho quando o orçamento de megapixels acaba', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 4, megapixels: 24 })

    const big = runTask(pool, 'big', { megapixels: 20 })
    void runTask(pool, 'next', { megapixels: 20 })
    await flush()

    // Há slot livre de sobra; quem barra o segundo job é a memória.
    expect(pool.stats()).toMatchObject({ active: 1, queued: 1, megapixelsInFlight: 20 })

    fleet.forSlot(0).emit({ type: 'done', jobId: 'big', result: result('big.webp') })
    await big
    await flush()

    expect(pool.stats()).toMatchObject({ active: 1, queued: 0, megapixelsInFlight: 20 })
  })

  it('deixa um job maior que o orçamento inteiro rodar sozinho', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 4, megapixels: 48 })

    void runTask(pool, 'enorme', { megapixels: 200 })
    void runTask(pool, 'pequeno', { megapixels: 2 })
    await flush()

    expect(pool.stats()).toMatchObject({ active: 1, queued: 1 })
    expect(fleet.forSlot(0).runs[0]?.jobId).toBe('enorme')
  })

  it('mantém a ordem da fila: o primeiro que não cabe segura os demais', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 4, megapixels: 24 })

    void runTask(pool, 'a', { megapixels: 20 })
    void runTask(pool, 'grande', { megapixels: 20 })
    void runTask(pool, 'minusculo', { megapixels: 1 })
    await flush()

    // `minusculo` caberia nos 4 MP restantes, e mesmo assim espera. Furar a
    // fila daria mais vazão e faria o job grande esperar indefinidamente.
    expect(pool.stats()).toMatchObject({ active: 1, queued: 2 })
  })

  it('repassa o progresso e avisa quando o job entra num worker', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 1, megapixels: 100 })

    const percentages: number[] = []
    let started = 0

    const job = pool.run({
      jobId: 'a',
      file: imageFile({ name: 'a.jpg' }),
      options,
      onStart: () => {
        started += 1
      },
      onProgress: (percent) => percentages.push(percent),
    })

    await flush()
    expect(started).toBe(1)

    const worker = fleet.forSlot(0)
    worker.emit({ type: 'progress', jobId: 'a', percent: 10 })
    worker.emit({ type: 'progress', jobId: 'a', percent: 95 })
    worker.emit({ type: 'done', jobId: 'a', result: result('a.webp') })

    await job
    expect(percentages).toEqual([10, 95])
  })

  it('roteia o probe sem gastar orçamento', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 1, megapixels: 10 })

    const probing = pool.probe(imageFile({ name: 'a.jpg' }), { jobId: 'a' })
    await flush()

    expect(pool.stats().megapixelsInFlight).toBe(0)

    fleet.forSlot(0).emit({
      type: 'metadata',
      jobId: 'a',
      metadata: { width: 4000, height: 3000, format: 'jpeg', bytes: 1000 },
    })

    await expect(probing).resolves.toMatchObject({ width: 4000, height: 3000 })
  })
})

describe('WorkerPool — cancelamento', () => {
  it('rejeita quem ainda está na fila sem tocar em worker nenhum', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 1, megapixels: 100 })
    const controller = new AbortController()

    void runTask(pool, 'a')
    const queued = pool.run({
      jobId: 'b',
      file: imageFile({ name: 'b.jpg' }),
      options,
      signal: controller.signal,
    })
    await flush()

    controller.abort()

    await expect(queued).rejects.toMatchObject({ name: 'AbortedError' })
    expect(fleet.workers).toHaveLength(1)
    expect(fleet.forSlot(0).runs.map((run) => run.jobId)).toEqual(['a'])
  })

  it('rejeita na hora quando o signal já vem abortado', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 1 })

    await expect(
      pool.run({
        jobId: 'a',
        file: imageFile({ name: 'a.jpg' }),
        options,
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ name: 'AbortedError' })

    expect(fleet.workers).toHaveLength(0)
  })

  it('pede o abort ao worker e aceita a resposta limpa', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 1, abortGraceMs: 50 })
    const controller = new AbortController()

    const job = pool.run({
      jobId: 'a',
      file: imageFile({ name: 'a.jpg' }),
      options,
      signal: controller.signal,
    })
    await flush()

    controller.abort()
    const worker = fleet.forSlot(0)
    expect(worker.aborts.map((request) => request.jobId)).toEqual(['a'])

    worker.emit({ type: 'cancelled', jobId: 'a' })
    await expect(job).rejects.toMatchObject({ name: 'AbortedError' })

    // Respondeu dentro do prazo: o worker continua vivo e é reaproveitado.
    expect(worker.terminated).toBe(false)
    expect(pool.stats()).toMatchObject({ active: 0, megapixelsInFlight: 0 })
  })

  it('termina o worker que não responde ao abort dentro do prazo', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 1, abortGraceMs: 20 })
    const controller = new AbortController()

    const job = pool.run({
      jobId: 'preso',
      file: imageFile({ name: 'a.jpg' }),
      options,
      megapixels: 12,
      signal: controller.signal,
    })
    await flush()

    controller.abort()
    const stuck = fleet.forSlot(0)
    expect(stuck.terminated).toBe(false)

    await expect(job).rejects.toMatchObject({ name: 'AbortedError' })

    // O worker preso dentro do encode é descartado, o orçamento volta, e o
    // próximo job sobe um worker novo.
    expect(stuck.terminated).toBe(true)
    expect(pool.stats().megapixelsInFlight).toBe(0)

    void runTask(pool, 'depois')
    await flush()
    expect(fleet.workers).toHaveLength(2)
    expect(fleet.forSlot(0)).not.toBe(stuck)
  })

  it('ignora a mensagem que chega de um worker já substituído', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 1, abortGraceMs: 10 })
    const controller = new AbortController()

    const cancelled = pool.run({
      jobId: 'a',
      file: imageFile({ name: 'a.jpg' }),
      options,
      signal: controller.signal,
    })
    await flush()

    controller.abort()
    const stuck = fleet.forSlot(0)
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortedError' })

    const next = runTask(pool, 'b')
    await flush()

    // O worker antigo termina o encode e responde tarde demais. Se o pool
    // aceitasse, o resultado de `a` viraria o resultado de `b`.
    stuck.emit({ type: 'done', jobId: 'a', result: result('atrasado.webp') })
    fleet.forSlot(0).emit({ type: 'done', jobId: 'b', result: result('b.webp') })

    await expect(next).resolves.toMatchObject({ outputName: 'b.webp' })
  })

  it('dispose rejeita o que está em voo e o que espera', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 1 })

    const running = runTask(pool, 'a')
    const queued = runTask(pool, 'b')
    await flush()

    pool.dispose()

    await expect(running).rejects.toMatchObject({ name: 'AbortedError' })
    await expect(queued).rejects.toMatchObject({ name: 'AbortedError' })
    expect(fleet.forSlot(0).terminated).toBe(true)
  })
})

describe('WorkerPool — falhas', () => {
  it('retenta uma vez, com worker novo, e entrega o resultado', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 1, megapixels: 100 })

    const job = runTask(pool, 'a', { megapixels: 12 })
    await flush()

    const first = fleet.forSlot(0)
    first.emit({
      type: 'failed',
      jobId: 'a',
      error: { kind: 'failed', name: 'Error', message: 'wasm morreu' },
    })
    await flush()

    // A hipótese é módulo WASM em estado ruim — o worker vai fora junto.
    expect(first.terminated).toBe(true)
    expect(fleet.workers).toHaveLength(2)

    fleet.forSlot(0).emit({ type: 'done', jobId: 'a', result: result('a.webp') })
    await expect(job).resolves.toMatchObject({ outputName: 'a.webp' })
    expect(pool.stats().megapixelsInFlight).toBe(0)
  })

  it('desiste na segunda falha', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 1 })

    const job = runTask(pool, 'a')
    await flush()

    for (let attempt = 0; attempt < 2; attempt += 1) {
      fleet.forSlot(0).emit({
        type: 'failed',
        jobId: 'a',
        error: { kind: 'failed', name: 'DecodeError', message: 'não decodifica' },
      })
      await flush()
    }

    await expect(job).rejects.toMatchObject({ name: 'DecodeError', message: 'não decodifica' })
  })

  it('não retenta arquivo não suportado — a falha é determinística', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 1 })

    const job = runTask(pool, 'a')
    await flush()

    fleet.forSlot(0).emit({
      type: 'failed',
      jobId: 'a',
      error: { kind: 'unsupported', name: 'UnsupportedInputError', message: 'sem motor' },
    })

    await expect(job).rejects.toMatchObject({ name: 'UnsupportedInputError' })
    expect(fleet.workers).toHaveLength(1)
  })

  it('retenta quando o worker morre sem responder nada', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 1 })

    const job = runTask(pool, 'a')
    await flush()

    fleet.forSlot(0).crash(new Error('Out of memory'))
    await flush()

    expect(fleet.workers).toHaveLength(2)
    fleet.forSlot(0).emit({ type: 'done', jobId: 'a', result: result('a.webp') })

    await expect(job).resolves.toMatchObject({ outputName: 'a.webp' })
  })

  it('libera o slot mesmo quando o job falha de vez', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 1, maxAttempts: 1 })

    const failing = runTask(pool, 'a', { megapixels: 12 })
    const next = runTask(pool, 'b')
    await flush()

    fleet.forSlot(0).emit({
      type: 'failed',
      jobId: 'a',
      error: { kind: 'failed', name: 'Error', message: 'quebrou' },
    })

    await expect(failing).rejects.toBeInstanceOf(JobError)
    await flush()

    expect(pool.stats()).toMatchObject({ active: 1, queued: 0, megapixelsInFlight: 0 })
    fleet.forSlot(0).emit({ type: 'done', jobId: 'b', result: result('b.webp') })
    await expect(next).resolves.toMatchObject({ outputName: 'b.webp' })
  })
})

describe('WorkerPool — prazo real do abort', () => {
  it('espera o prazo antes de terminar o worker', async () => {
    const fleet = fakeWorkerFleet()
    const pool = new WorkerPool({ createWorker: fleet.factory, size: 1, abortGraceMs: 60 })
    const controller = new AbortController()

    const job = pool.run({
      jobId: 'a',
      file: imageFile({ name: 'a.jpg' }),
      options,
      signal: controller.signal,
    })
    await flush()

    controller.abort()
    await sleep(20)

    // Ainda dentro do prazo: o worker tem chance de responder sozinho.
    expect(fleet.forSlot(0).terminated).toBe(false)

    await expect(job).rejects.toMatchObject({ name: 'AbortedError' })
    expect(fleet.forSlot(0).terminated).toBe(true)
  })
})
