/**
 * Entrada de arquivos — os três caminhos do `PLANO.md` §4.1.
 *
 * O que este módulo resolve é uma assimetria do navegador: arquivos escolhidos
 * por `<input webkitdirectory>` chegam com `webkitRelativePath` preenchido, mas
 * arquivos **arrastados dentro de uma pasta** chegam por
 * `FileSystemFileEntry.file()` — que devolve um `File` com
 * `webkitRelativePath` **vazio**. Sem correção, arrastar uma pasta perderia a
 * estrutura de subpastas que o app desktop preservava.
 *
 * A correção é definir a propriedade na mão (ela é somente-leitura, mas
 * configurável). É o mesmo truque que os testes usam, e mantém o motor com um
 * único contrato: `file.webkitRelativePath || file.name`.
 */

/** Teto de segurança: uma pasta com link circular não pode travar a aba. */
export const MAX_SCAN_ENTRIES = 20_000
/** Profundidade máxima da varredura recursiva. */
export const MAX_SCAN_DEPTH = 24

interface FileSystemEntryLike {
  isFile: boolean
  isDirectory: boolean
  name: string
  fullPath?: string
}

interface FileSystemFileEntryLike extends FileSystemEntryLike {
  file(onSuccess: (file: File) => void, onError?: (error: unknown) => void): void
}

interface FileSystemDirectoryReaderLike {
  readEntries(
    onSuccess: (entries: FileSystemEntryLike[]) => void,
    onError?: (error: unknown) => void,
  ): void
}

interface FileSystemDirectoryEntryLike extends FileSystemEntryLike {
  createReader(): FileSystemDirectoryReaderLike
}

interface DataTransferItemLike {
  kind: string
  webkitGetAsEntry?: () => FileSystemEntryLike | null
  getAsFile(): File | null
}

export interface DataTransferLike {
  items?: ArrayLike<DataTransferItemLike>
  files?: ArrayLike<File>
}

/**
 * Anexa o caminho relativo a um `File` que não o tem.
 *
 * Devolve o próprio arquivo quando já há caminho ou quando a definição falha —
 * um `File` sem estrutura ainda é processável, só perde a subpasta.
 */
export function withRelativePath(file: File, relativePath: string): File {
  if (file.webkitRelativePath) return file

  try {
    Object.defineProperty(file, 'webkitRelativePath', {
      value: relativePath,
      configurable: true,
      enumerable: true,
    })
  } catch {
    // Navegador que congela a instância: seguimos com o nome puro.
  }

  return file
}

function readEntries(reader: FileSystemDirectoryReaderLike): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve) => {
    reader.readEntries(
      (entries) => resolve(entries),
      () => resolve([]),
    )
  })
}

function readFile(entry: FileSystemFileEntryLike): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    )
  })
}

function isDirectoryEntry(entry: FileSystemEntryLike): entry is FileSystemDirectoryEntryLike {
  return entry.isDirectory && 'createReader' in entry
}

function isFileEntry(entry: FileSystemEntryLike): entry is FileSystemFileEntryLike {
  return entry.isFile && 'file' in entry
}

/**
 * Varre uma entrada arrastada, recursivamente, preservando o caminho.
 *
 * O `readEntries` do padrão devolve os filhos **em lotes** e sinaliza o fim com
 * um lote vazio: chamar uma vez só perde arquivos em pastas grandes (o Chrome
 * entrega 100 por vez). O laço abaixo existe por isso.
 */
async function scanEntry(
  entry: FileSystemEntryLike,
  prefix: string,
  collected: File[],
  depth: number,
): Promise<void> {
  if (collected.length >= MAX_SCAN_ENTRIES) return

  const path = prefix ? `${prefix}/${entry.name}` : entry.name

  if (isFileEntry(entry)) {
    const file = await readFile(entry)
    if (file) collected.push(withRelativePath(file, path))
    return
  }

  if (!isDirectoryEntry(entry) || depth >= MAX_SCAN_DEPTH) return

  const reader = entry.createReader()

  for (;;) {
    const batch = await readEntries(reader)
    if (batch.length === 0) return

    for (const child of batch) {
      await scanEntry(child, path, collected, depth + 1)
      if (collected.length >= MAX_SCAN_ENTRIES) return
    }
  }
}

/**
 * Extrai os arquivos de um `drop`, descendo em pastas quando o navegador
 * oferece `webkitGetAsEntry`.
 *
 * Sem esse suporte — ou quando o item não é entrada de sistema de arquivos —
 * cai em `DataTransfer.files`, que traz os arquivos soltos sem estrutura. É
 * degradação, não falha.
 */
export async function collectDroppedFiles(transfer: DataTransferLike): Promise<File[]> {
  const items = transfer.items ? Array.from(transfer.items) : []
  const entries = items
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.() ?? null)

  // A leitura precisa acontecer antes de qualquer `await`: o `DataTransfer` é
  // esvaziado ao fim do evento, então o `getAsFile` de fallback é feito aqui.
  const fallback = entries.some((entry) => entry === null)
    ? items.map((item) => item.getAsFile()).filter((file): file is File => file !== null)
    : []

  const collected: File[] = []
  for (const entry of entries) {
    if (entry) await scanEntry(entry, '', collected, 0)
  }

  if (collected.length > 0) return collected
  if (fallback.length > 0) return fallback

  return transfer.files ? Array.from(transfer.files) : []
}

/** Arquivos de um `<input type="file">`, que já vêm com o caminho relativo. */
export function collectInputFiles(input: HTMLInputElement | null): File[] {
  return input?.files ? Array.from(input.files) : []
}

/** Soma dos tamanhos, para o "248,6 MB na fila" do dropzone ativo. */
export function totalBytes(files: readonly { size: number }[]): number {
  return files.reduce((sum, file) => sum + file.size, 0)
}
