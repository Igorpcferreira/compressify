import { describe, expect, it } from 'vitest'
import { createRegistry } from '@/engine/core/registry'
import type {
  CompressionEngine,
  FileMetadata,
  JobContext,
  JobOptions,
  JobResult,
} from '@/engine/core/types'
import type { WorkerResponse } from '@/engine/workers/protocol'
import { createJobRunner } from '@/engine/workers/runner'
import { imageFile } from '../helpers/images'
import { flush } from '../helpers/workers'

const options: JobOptions = {
  mode: 'auto',
  preset: 5,
  outputFormat: 'smart',
  quality: 82,
}

const metadata: FileMetadata = { width: 4000, height: 3000, format: 'jpeg', bytes: 1000 }

function jobResult(): JobResult {
  return {
    blob: new Blob([new Uint8Array(4)], { type: 'image/webp' }),
    outputName: 'foto-compressify.webp',
    originalBytes: 100,
    compressedBytes: 40,
    savedBytes: 60,
    savedPercent: 60,
    status: 'success',
    width: 4000,
    height: 3000,
  }
}

interface FakeEngineOptions {
  supports?: (file: File) => boolean
  probe?: () => Promise<FileMetadata>
  process?: (file: File, options: JobOptions, ctx: JobContext) => Promise<JobResult>
}

function fakeEngine(overrides: FakeEngineOptions = {}): CompressionEngine {
  return {
    id: 'fake',
    supports: overrides.supports ?? (() => true),
    probe: overrides.probe ?? (() => Promise.resolve(metadata)),
    process: overrides.process ?? (() => Promise.resolve(jobResult())),
  }
}

function runnerFor(engine: CompressionEngine) {
  const sent: WorkerResponse[] = []
  const runner = createJobRunner({
    registry: createRegistry([engine]),
    post: (message) => sent.push(message),
  })
  return { runner, sent }
}

describe('createJobRunner', () => {
  it('responde ao probe com as dimensões', async () => {
    const { runner, sent } = runnerFor(fakeEngine())

    runner.handle({ type: 'probe', jobId: 'a', file: imageFile({ name: 'foto.jpg' }) })
    await flush()

    expect(sent).toEqual([{ type: 'metadata', jobId: 'a', metadata }])
  })

  it('repassa o progresso e devolve o resultado', async () => {
    const engine = fakeEngine({
      process: (_file, _options, ctx) => {
        ctx.onProgress(10)
        ctx.onProgress(95)
        return Promise.resolve(jobResult())
      },
    })
    const { runner, sent } = runnerFor(engine)

    runner.handle({ type: 'run', jobId: 'a', file: imageFile({ name: 'foto.jpg' }), options })
    await flush()

    expect(sent.map((message) => message.type)).toEqual(['progress', 'progress', 'done'])
    expect(sent[0]).toMatchObject({ percent: 10 })
  })

  it('aborta o job pelo jobId e responde cancelled', async () => {
    const engine = fakeEngine({
      process: (_file, _options, ctx) =>
        new Promise((_resolve, reject) => {
          ctx.signal.addEventListener('abort', () => {
            const error = new Error('Operação cancelada.')
            error.name = 'AbortedError'
            reject(error)
          })
        }),
    })
    const { runner, sent } = runnerFor(engine)

    runner.handle({ type: 'run', jobId: 'a', file: imageFile({ name: 'foto.jpg' }), options })
    await flush()
    expect(runner.active).toBe(1)

    runner.handle({ type: 'abort', jobId: 'a' })
    await flush()

    // Cancelamento não é falha: sai como `cancelled`, não como `failed`.
    expect(sent).toEqual([{ type: 'cancelled', jobId: 'a' }])
    expect(runner.active).toBe(0)
  })

  it('não entrega resultado de um job cancelado durante o último encode', async () => {
    // Um encode isolado não é interrompível: o abort chega, o encode termina
    // mesmo assim, e o resultado precisa ser descartado — senão um card
    // cancelado volta sozinho para "concluído".
    let release: () => void = () => {}
    const engine = fakeEngine({
      process: () =>
        new Promise<JobResult>((resolve) => {
          release = () => resolve(jobResult())
        }),
    })
    const { runner, sent } = runnerFor(engine)

    runner.handle({ type: 'run', jobId: 'a', file: imageFile({ name: 'foto.jpg' }), options })
    await flush()

    runner.handle({ type: 'abort', jobId: 'a' })
    release()
    await flush()

    expect(sent).toEqual([{ type: 'cancelled', jobId: 'a' }])
  })

  it('ignora abort de um job que não existe', () => {
    const { runner, sent } = runnerFor(fakeEngine())

    expect(() => runner.handle({ type: 'abort', jobId: 'fantasma' })).not.toThrow()
    expect(sent).toEqual([])
  })

  it('reporta arquivo sem motor com a mensagem do registro', async () => {
    const { runner, sent } = runnerFor(fakeEngine({ supports: () => false }))

    runner.handle({ type: 'run', jobId: 'a', file: imageFile({ name: 'scan.tif' }), options })
    await flush()

    const failure = sent[0]
    expect(failure?.type).toBe('failed')
    if (failure?.type !== 'failed') return

    expect(failure.error.kind).toBe('unsupported')
    expect(failure.error.message).toContain('não decodificam TIFF')
  })

  it('serializa a falha do motor preservando nome e mensagem', async () => {
    const engine = fakeEngine({
      process: () => {
        const error = new Error('não foi possível decodificar')
        error.name = 'DecodeError'
        return Promise.reject(error)
      },
    })
    const { runner, sent } = runnerFor(engine)

    runner.handle({ type: 'run', jobId: 'a', file: imageFile({ name: 'foto.jpg' }), options })
    await flush()

    expect(sent).toEqual([
      {
        type: 'failed',
        jobId: 'a',
        error: { kind: 'failed', name: 'DecodeError', message: 'não foi possível decodificar' },
      },
    ])
  })

  it('reporta falha do probe sem derrubar o worker', async () => {
    const engine = fakeEngine({ probe: () => Promise.reject(new Error('cabeçalho ilegível')) })
    const { runner, sent } = runnerFor(engine)

    runner.handle({ type: 'probe', jobId: 'a', file: imageFile({ name: 'foto.jpg' }) })
    await flush()

    expect(sent[0]).toMatchObject({ type: 'failed', error: { kind: 'failed' } })
  })
})
