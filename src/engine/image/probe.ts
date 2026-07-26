/**
 * Leitura de cabeçalho de imagem — formato, dimensões e profundidade de bits.
 *
 * Por que ler o cabeçalho em vez de decodificar:
 *
 * 1. O orçamento de megapixels do pool (docs/PLANO.md §2.1) precisa das
 *    dimensões **antes** de despachar o job. Decodificar 50 arquivos só para
 *    saber o tamanho custaria o dobro do trabalho útil.
 * 2. O formato detectado aqui — por bytes mágicos, não por extensão — é o que
 *    escolhe o decoder WASM no fallback (`decode.ts`).
 * 3. A profundidade de bits do PNG decide o roteamento do decode: o canvas
 *    rebaixa 16 bits para 8 (docs/PLANO.md §3.2).
 *
 * Código puro sobre typed arrays: sem DOM, sem WASM, testável direto.
 *
 * **Limite conhecido:** as dimensões são as *armazenadas*. Uma foto de celular
 * com orientação EXIF de 90° é reportada aqui como 4000×3000 mesmo exibindo
 * 3000×4000. Para o orçamento de memória dá no mesmo (a área não muda) e o
 * `ImageEngine` usa as dimensões do decode, que já vêm rotacionadas. Se a UI
 * um dia precisar do valor exibido antes do decode, é aqui que entra a leitura
 * da tag 0x0112.
 */

import type { ImageFormat } from '@/engine/core/types'

/**
 * Quanto do arquivo basta ler para achar o cabeçalho.
 *
 * O SOF do JPEG vem depois dos segmentos APPn, e um APP1/EXIF sozinho pode ter
 * 64 KB. 128 KB cobre EXIF + ICC com folga sem trazer o arquivo inteiro para a
 * memória.
 */
export const HEADER_SLICE_BYTES = 128 * 1024

export interface ImageHeader {
  format: ImageFormat
  width: number
  height: number
  /** Bits por canal, quando o formato declara. `null` quando não se aplica. */
  bitDepth: number | null
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function matches(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let text = ''
  for (let i = 0; i < length; i += 1) {
    text += String.fromCharCode(bytes[offset + i] ?? 0)
  }
  return text
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

/**
 * Formato pelos bytes mágicos.
 *
 * A extensão não serve: arquivos renomeados são comuns e escolher o decoder
 * WASM errado falha com uma mensagem incompreensível.
 */
export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  if (matches(bytes, 0, PNG_SIGNATURE)) return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'

  if (readAscii(bytes, 0, 4) === 'RIFF' && readAscii(bytes, 8, 4) === 'WEBP') {
    return 'webp'
  }

  if (readAscii(bytes, 4, 4) === 'ftyp' && isAvifBrand(bytes)) {
    return 'avif'
  }

  return null
}

/** Marcadores SOF do JPEG: 0xC0–0xCF, menos DHT (C4), JPG (C8) e DAC (CC). */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
}

function readPng(bytes: Uint8Array): ImageHeader | null {
  // 8 bytes de assinatura + 4 de tamanho do chunk, e então 'IHDR'.
  if (bytes.length < 26 || readAscii(bytes, 12, 4) !== 'IHDR') return null

  const view = viewOf(bytes)
  return {
    format: 'png',
    width: view.getUint32(16),
    height: view.getUint32(20),
    bitDepth: bytes[24] ?? null,
  }
}

function readJpeg(bytes: Uint8Array): ImageHeader | null {
  const view = viewOf(bytes)
  let offset = 2

  while (offset + 9 < bytes.length) {
    // Bytes 0xFF de preenchimento entre segmentos são legais; só avança.
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }

    const marker = bytes[offset + 1] ?? 0
    if (marker === 0xff) {
      offset += 1
      continue
    }

    // Marcadores sem payload: SOI, RSTn, EOI, TEM.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2
      continue
    }

    const length = view.getUint16(offset + 2)
    if (length < 2) return null

    if (isStartOfFrame(marker)) {
      return {
        format: 'jpeg',
        width: view.getUint16(offset + 7),
        height: view.getUint16(offset + 5),
        bitDepth: bytes[offset + 4] ?? null,
      }
    }

    // Começou a varredura sem passar por um SOF: o arquivo está truncado ou
    // corrompido. Desistir aqui é melhor que devolver lixo.
    if (marker === 0xda) return null

    offset += 2 + length
  }

  return null
}

/**
 * WebP tem três variantes de chunk, cada uma guardando as dimensões num lugar
 * diferente. VP8X é o que aparece em arquivos com alfa ou animação.
 */
function readWebp(bytes: Uint8Array): ImageHeader | null {
  const chunk = readAscii(bytes, 12, 4)
  const view = viewOf(bytes)

  if (chunk === 'VP8 ' && bytes.length >= 30) {
    // Payload em 20; sync code 0x9D 0x01 0x2A confirma um keyframe.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null
    return {
      format: 'webp',
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
      bitDepth: null,
    }
  }

  if (chunk === 'VP8L' && bytes.length >= 25) {
    if (bytes[20] !== 0x2f) return null
    // 14 bits de largura e 14 de altura, ambos menos um, empacotados em LE.
    const packed = view.getUint32(21, true)
    return {
      format: 'webp',
      width: (packed & 0x3fff) + 1,
      height: ((packed >> 14) & 0x3fff) + 1,
      bitDepth: null,
    }
  }

  if (chunk === 'VP8X' && bytes.length >= 30) {
    // Dimensões do canvas em 24 bits LE, menos um.
    const width = ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16)) + 1
    const height = ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16)) + 1
    return { format: 'webp', width, height, bitDepth: null }
  }

  return null
}

function isAvifBrand(bytes: Uint8Array): boolean {
  const view = viewOf(bytes)
  if (bytes.length < 12) return false

  // O ftyp lista a marca principal e as compatíveis; basta uma ser AVIF.
  const size = Math.min(view.getUint32(0), bytes.length)
  for (let offset = 8; offset + 4 <= size; offset += 4) {
    const brand = readAscii(bytes, offset, 4)
    if (brand === 'avif' || brand === 'avis') return true
  }
  return false
}

/**
 * AVIF é ISOBMFF: as dimensões vivem numa caixa `ispe`, aninhada em
 * meta → iprp → ipco.
 *
 * Em vez de descer a árvore inteira, varremos as ocorrências de `ispe` e
 * ficamos com a de maior área. Um AVIF pode ter mais de uma (miniatura, canal
 * alfa auxiliar), e a imagem principal é sempre a maior delas. Resolver isso
 * "direito" exigiria interpretar `pitm` e `ipma` — dezenas de linhas para o
 * formato de entrada mais raro do produto. Se algum dia um AVIF real furar
 * esta heurística, o decode ainda devolve as dimensões corretas; só o
 * orçamento de memória fica com uma estimativa.
 */
function readAvif(bytes: Uint8Array): ImageHeader | null {
  let best: ImageHeader | null = null
  const view = viewOf(bytes)

  for (let offset = 4; offset + 16 <= bytes.length; offset += 1) {
    if (readAscii(bytes, offset, 4) !== 'ispe') continue

    // 4 bytes de versão/flags, depois largura e altura em 32 bits BE.
    const width = view.getUint32(offset + 8)
    const height = view.getUint32(offset + 12)
    if (width <= 0 || height <= 0) continue

    if (!best || width * height > best.width * best.height) {
      best = { format: 'avif', width, height, bitDepth: null }
    }
  }

  return best
}

/**
 * Devolve o cabeçalho, ou `null` quando o formato não é reconhecido ou o
 * cabeçalho não cabe no trecho lido. O chamador decide o fallback.
 */
export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
  const format = sniffFormat(bytes)

  switch (format) {
    case 'png':
      return readPng(bytes)
    case 'jpeg':
      return readJpeg(bytes)
    case 'webp':
      return readWebp(bytes)
    case 'avif':
      return readAvif(bytes)
    case null:
      return null
  }
}

/** PNG de 16 bits: o canvas rebaixa para 8, então o decode vai por WASM. */
export function isDeepPng(header: ImageHeader | null): boolean {
  return header?.format === 'png' && header.bitDepth === 16
}
