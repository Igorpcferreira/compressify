/**
 * A montagem do ZIP — o que roda dentro do worker.
 *
 * Duas decisões que valem explicação:
 *
 * 1. **Sem compressão (`ZipPassThrough`, método "stored").** Tudo que entra
 *    aqui já saiu de um encoder: JPEG, WebP, AVIF e PNG são fluxos comprimidos.
 *    Passar deflate por cima gasta CPU proporcional ao lote inteiro para ganhar
 *    perto de zero por cento — e num lote de 50 fotos isso é a diferença entre
 *    o ZIP sair na hora e o usuário esperar de novo depois de já ter esperado a
 *    compressão. O `.zip` continua um `.zip` válido: "stored" é método do
 *    formato, não um atalho nosso.
 *
 * 2. **Fluxo, não mapa.** A API simples do fflate (`zip(objeto, cb)`) exige
 *    todos os bytes de entrada na memória **e** produz a saída inteira de uma
 *    vez — 2× o tamanho do lote. Com `Zip` + `ZipPassThrough`, cada arquivo é
 *    lido, empurrado e descartado, e os pedaços da saída viram um `Blob`, que o
 *    navegador respalda em disco (docs/PLANO.md §8, decisão 6).
 *
 * O módulo é puro o bastante para rodar em Node: os testes montam um ZIP de
 * verdade e o descompactam com o próprio fflate para conferir caminhos e bytes.
 */

import { Zip, ZipPassThrough } from 'fflate'
import {
  ZIP_MIME_TYPE,
  type ZipEntry,
  type ZipWorkerRequest,
  type ZipWorkerResponse,
} from './zip-protocol'

export interface ZipRunnerOptions {
  post(message: ZipWorkerResponse): void
}

export interface ZipRunner {
  handle(message: ZipWorkerRequest): void
}

/**
 * Um `Uint8Array` genérico não é `BlobPart` para o TypeScript porque poderia
 * estar sobre um `SharedArrayBuffer`. Quando a view cobre o buffer inteiro
 * passamos o próprio buffer, sem copiar — e o fflate sempre entrega assim.
 */
function toBlobPart(bytes: Uint8Array): BlobPart {
  const { buffer, byteOffset, byteLength } = bytes

  if (buffer instanceof ArrayBuffer && byteOffset === 0 && byteLength === buffer.byteLength) {
    return buffer
  }

  const copy = new ArrayBuffer(byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

export function createZipRunner({ post }: ZipRunnerOptions): ZipRunner {
  const cancelled = new Set<string>()

  async function build(id: string, entries: readonly ZipEntry[]): Promise<void> {
    const chunks: BlobPart[] = []
    let failure: string | null = null
    let finished = false

    const zip = new Zip((error, chunk, final) => {
      if (error) {
        failure ??= error.message
        return
      }

      if (chunk.length > 0) chunks.push(toBlobPart(chunk))
      if (final) finished = true
    })

    try {
      for (const [index, entry] of entries.entries()) {
        if (cancelled.has(id)) {
          zip.terminate()
          post({ type: 'zip-cancelled', id })
          return
        }

        const file = new ZipPassThrough(entry.path)
        zip.add(file)

        // A leitura acontece aqui, dentro do worker: os bytes do resultado nunca
        // passam pela thread principal.
        const data = new Uint8Array(await entry.blob.arrayBuffer())
        file.push(data, true)

        if (failure) break

        post({
          type: 'zip-progress',
          id,
          percent: Math.round(((index + 1) / entries.length) * 100),
        })
      }

      if (failure) {
        post({ type: 'zip-failed', id, message: failure })
        return
      }

      zip.end()

      if (!finished) {
        post({ type: 'zip-failed', id, message: 'O arquivo ZIP não foi finalizado.' })
        return
      }

      post({ type: 'zip-done', id, blob: new Blob(chunks, { type: ZIP_MIME_TYPE }) })
    } catch (error) {
      post({
        type: 'zip-failed',
        id,
        message: error instanceof Error ? error.message : 'Falha ao montar o ZIP.',
      })
    } finally {
      cancelled.delete(id)
    }
  }

  return {
    handle(message) {
      switch (message.type) {
        case 'zip':
          void build(message.id, message.entries)
          return

        case 'abort':
          cancelled.add(message.id)
          return
      }
    },
  }
}
