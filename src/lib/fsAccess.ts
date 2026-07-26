/**
 * "Salvar em pasta" — melhoria progressiva sobre a File System Access API.
 *
 * A regra do `PLANO.md` §4.2 é explícita e vale repetir: **quando o recurso não
 * existe, ninguém fica sabendo**. Nada de botão desabilitado com "seu navegador
 * não suporta", nada de aviso. O Firefox e o Safari simplesmente veem a
 * interface sem esta opção, e o download comum continua ali fazendo o trabalho.
 *
 * É o único caminho de saída que recria a árvore de subpastas no disco: o
 * atributo `download` de um link ignora diretórios, e o ZIP preserva a estrutura
 * mas exige descompactar.
 *
 * A API é tipada aqui em vez de vir do `lib.dom`: as definições do TypeScript
 * ainda não cobrem `showDirectoryPicker` de forma estável entre versões, e uma
 * declaração local é mais honesta que um `any`.
 */

import { splitPath } from '@/engine/core/naming'

interface WritableStreamLike {
  write(data: Blob): Promise<void>
  close(): Promise<void>
}

interface FileHandleLike {
  createWritable(): Promise<WritableStreamLike>
}

export interface DirectoryHandleLike {
  name: string
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>
}

interface PickerWindow {
  showDirectoryPicker?(options?: { mode?: 'read' | 'readwrite' }): Promise<DirectoryHandleLike>
}

export interface SaveEntry {
  /** Caminho relativo, com subpastas. */
  path: string
  blob: Blob
}

export interface SaveOptions {
  onProgress?(percent: number): void
  signal?: AbortSignal
  /** Ponto de injeção dos testes: uma pasta de mentira, sem disco. */
  directory?: DirectoryHandleLike
}

export interface SaveResult {
  directoryName: string
  written: number
}

/** Cancelamento — do usuário na fila ou ao fechar o seletor de pasta. */
export class SaveCancelledError extends Error {
  constructor() {
    super('Gravação cancelada.')
    this.name = 'AbortedError'
  }
}

export function supportsDirectoryPicker(): boolean {
  return typeof (globalThis as PickerWindow).showDirectoryPicker === 'function'
}

/**
 * Abre o seletor e devolve a pasta, ou `null` se o usuário fechou.
 *
 * Precisa ser chamada **dentro do gesto do usuário** — um `await` antes do
 * `showDirectoryPicker` faz o navegador recusar por falta de ativação.
 */
export async function pickDirectory(): Promise<DirectoryHandleLike | null> {
  const picker = (globalThis as PickerWindow).showDirectoryPicker
  if (!picker) return null

  try {
    return await picker({ mode: 'readwrite' })
  } catch {
    // `AbortError` quando o usuário fecha o seletor: não é falha, é desistência.
    return null
  }
}

/** Desce (criando) até a pasta do caminho e devolve o handle do diretório. */
async function directoryFor(root: DirectoryHandleLike, dir: string): Promise<DirectoryHandleLike> {
  let current = root

  for (const segment of dir.split('/')) {
    if (!segment || segment === '.') continue
    // `..` nunca aparece: os caminhos vêm de `webkitRelativePath`, que é
    // relativo e normalizado. Descartar é mais seguro que confiar.
    if (segment === '..') continue
    current = await current.getDirectoryHandle(segment, { create: true })
  }

  return current
}

export async function saveToDirectory(
  entries: readonly SaveEntry[],
  options: SaveOptions = {},
): Promise<SaveResult> {
  const root = options.directory ?? (await pickDirectory())
  if (!root) throw new SaveCancelledError()

  let written = 0

  for (const [index, entry] of entries.entries()) {
    if (options.signal?.aborted) throw new SaveCancelledError()

    const { dir, stem, extension } = splitPath(entry.path)
    const folder = await directoryFor(root, dir)
    const handle = await folder.getFileHandle(`${stem}${extension}`, { create: true })

    const stream = await handle.createWritable()
    // O `Blob` vai inteiro para o stream: o navegador copia do armazenamento de
    // blobs para o disco sem materializar os bytes em JavaScript.
    await stream.write(entry.blob)
    await stream.close()

    written += 1
    options.onProgress?.(Math.round(((index + 1) / entries.length) * 100))
  }

  return { directoryName: root.name, written }
}
