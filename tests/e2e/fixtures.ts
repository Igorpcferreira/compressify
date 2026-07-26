/**
 * PNGs de verdade, montados aqui.
 *
 * Não há imagem binária no repositório de propósito: um arquivo gerado é
 * determinístico, tem o tamanho que o teste precisa e carrega um **marcador
 * único** nos próprios bytes — que é o que torna o `privacy.spec.ts` uma
 * afirmação e não uma opinião. Se qualquer requisição levasse o conteúdo do
 * usuário, o marcador apareceria no corpo dela.
 *
 * O PNG é montado à mão (assinatura, IHDR, tEXt, IDAT, IEND) porque isso não
 * exige dependência nenhuma além do `zlib` do Node — e porque um PNG real,
 * decodificável pelo navegador, é o único jeito de o E2E exercitar o motor de
 * verdade em vez de um caminho de erro.
 */

import { deflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Buffer): number {
  let c = 0xffffffff
  for (const byte of data) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))

  return Buffer.concat([length, body, crc])
}

export interface FixtureOptions {
  width?: number
  height?: number
  /** Semente do ruído: fixturas diferentes, bytes determinísticos. */
  seed?: number
  /** Vai num chunk tEXt, em texto puro, dentro do arquivo. */
  marker?: string
}

/**
 * Uma foto sintética com entropia de fotografia — a mesma ideia do harness do
 * spike: gradiente, brilho radial e ruído de alta frequência. Uma imagem lisa
 * comprimiria a quase nada e faria o teste passar sem exercitar o motor.
 */
export function pngFixture({
  width = 640,
  height = 480,
  seed = 1,
  marker,
}: FixtureOptions = {}): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // profundidade
  ihdr[9] = 2 // truecolor RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Cada scanline começa com o byte de filtro (0 = nenhum).
  const raw = Buffer.alloc(height * (width * 3 + 1))
  let state = seed >>> 0
  const random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0xffffffff
  }

  const centerX = width / 2
  const centerY = height / 3

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1)
    raw[rowStart] = 0

    for (let x = 0; x < width; x += 1) {
      const i = rowStart + 1 + x * 3
      const vertical = y / height
      const distance = Math.hypot(x - centerX, y - centerY) / Math.hypot(width, height)
      const glow = Math.max(0, 1 - distance * 2) ** 2
      const noise = (random() - 0.5) * 40

      raw[i] = Math.max(0, Math.min(255, 120 + vertical * 60 + glow * 110 + noise))
      raw[i + 1] = Math.max(0, Math.min(255, 140 + vertical * 40 + glow * 90 + noise))
      raw[i + 2] = Math.max(0, Math.min(255, 190 - vertical * 90 + glow * 60 + noise))
    }
  }

  const chunks = [SIGNATURE, chunk('IHDR', ihdr)]

  if (marker) {
    chunks.push(chunk('tEXt', Buffer.from(`Comment\0${marker}`, 'latin1')))
  }

  chunks.push(chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)))

  return Buffer.concat(chunks)
}

export interface FixtureFile {
  name: string
  mimeType: string
  buffer: Buffer
}

/** O marcador que o teste de privacidade procura em toda requisição. */
export const PRIVACY_MARKER = 'COMPRESSIFY-CONTEUDO-PRIVADO-4f2a91'

export function fixtureFiles(count: number, options: FixtureOptions = {}): FixtureFile[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `foto-${index + 1}.png`,
    mimeType: 'image/png',
    buffer: pngFixture({ ...options, seed: index + 1 }),
  }))
}
