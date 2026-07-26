/**
 * O contrato do worker de ZIP.
 *
 * Separado do `protocol.ts` de propósito: são dois workers com ciclos de vida
 * diferentes. O de imagem é do pool — vive, recebe muitos jobs e às vezes é
 * substituído. O de ZIP é de uso único: nasce ao clicar em "Baixar tudo",
 * entrega um `Blob` e morre. Misturar as duas conversas num tipo só faria cada
 * lado carregar mensagens que nunca vai ver.
 *
 * Os `Blob` cruzam a fronteira por referência ao conteúdo — o navegador não
 * duplica os bytes. É o que permite mandar 500 MB de resultados para o worker
 * sem tocar neles na thread principal.
 */

export interface ZipEntry {
  /** Caminho dentro do arquivo, com barras normais. */
  path: string
  blob: Blob
}

export interface ZipRequest {
  type: 'zip'
  id: string
  entries: ZipEntry[]
}

export interface ZipAbortRequest {
  type: 'abort'
  id: string
}

export type ZipWorkerRequest = ZipRequest | ZipAbortRequest

export interface ZipProgressMessage {
  type: 'zip-progress'
  id: string
  percent: number
}

export interface ZipDoneMessage {
  type: 'zip-done'
  id: string
  blob: Blob
}

export interface ZipCancelledMessage {
  type: 'zip-cancelled'
  id: string
}

export interface ZipFailedMessage {
  type: 'zip-failed'
  id: string
  message: string
}

export type ZipWorkerResponse =
  ZipProgressMessage | ZipDoneMessage | ZipCancelledMessage | ZipFailedMessage

export const ZIP_MIME_TYPE = 'application/zip'
