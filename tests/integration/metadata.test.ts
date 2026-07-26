/**
 * Os metadados não sobrevivem — e isso não é efeito colateral, é a resposta.
 *
 * O roadmap pedia "remover metadados EXIF **opcionalmente**", pensando na foto
 * de celular que carrega a coordenada de onde foi tirada. Ao ir implementar,
 * a conclusão foi que a caixinha de opção não deveria existir: o pipeline
 * decodifica para pixels e recodifica do zero, então **nada** de EXIF, IPTC,
 * XMP ou perfil ICC atravessa. Não há o que ligar; há o que provar.
 *
 * Este arquivo é a prova. Ele constrói um JPEG com um bloco EXIF de verdade,
 * contendo um marcador reconhecível — o mesmo truque que o `privacy.spec.ts`
 * usa para afirmar que nenhum byte do usuário sai pela rede — e verifica que o
 * marcador não está na saída de nenhum dos formatos.
 *
 * A exceção deliberada é a **orientação**, que não é preservada como metadado e
 * sim **aplicada aos pixels**: `imageOrientation: 'from-image'` no caminho
 * nativo e o padrão do `@jsquash/jpeg` no fallback (docs/HANDOFF.md §3.2). Uma
 * foto de celular em pé sai em pé, sem levar junto a coordenada de onde foi
 * tirada. É a fidelidade com o `.rotate()` do app desktop, sem o resto.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import type { ImageFormat, JobContext, JobOptions } from '@/engine/core/types'
import { ImageEngine } from '@/engine/image/engine'
import { initNodeCodecs } from '../helpers/codecs-node'
import { synthPhoto } from '../helpers/images'

/** O que procuramos na saída. Não é uma string que apareça por acaso. */
const MARCADOR = 'COMPRESSIFY-EXIF-NAO-DEVE-SOBREVIVER'

function uint16le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff]
}

function uint32le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff]
}

/**
 * Um bloco TIFF mínimo com o marcador em `ImageDescription` (tag 0x010E).
 *
 * Montado à mão, como todas as fixturas deste projeto: nenhum binário entra no
 * repositório, e um construtor explícito deixa visível qual campo está sendo
 * exercitado.
 */
function tiffComMarcador(texto: string): number[] {
  const ascii = [...texto].map((char) => char.charCodeAt(0))
  const valor = [...ascii, 0]
  const OFFSET_DO_VALOR = 26 // logo depois do IFD0

  return [
    0x49,
    0x49, // 'II' — little endian
    ...uint16le(0x002a), // marca do TIFF
    ...uint32le(8), // offset do IFD0
    ...uint16le(1), // uma entrada
    ...uint16le(0x010e), // tag ImageDescription
    ...uint16le(2), // tipo ASCII
    ...uint32le(valor.length),
    ...uint32le(OFFSET_DO_VALOR),
    ...uint32le(0), // não há IFD1
    ...valor,
  ]
}

/** Insere um APP1/Exif logo depois do SOI de um JPEG existente. */
function comExif(jpeg: Uint8Array, texto: string): Uint8Array {
  const tiff = tiffComMarcador(texto)
  const cabecalhoExif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] // "Exif\0\0"
  const tamanho = 2 + cabecalhoExif.length + tiff.length

  const segmento = [
    0xff,
    0xe1, // APP1
    (tamanho >> 8) & 0xff, // comprimento é big-endian, ao contrário do TIFF
    tamanho & 0xff,
    ...cabecalhoExif,
    ...tiff,
  ]

  const saida = new Uint8Array(jpeg.length + segmento.length)
  saida.set(jpeg.subarray(0, 2), 0) // SOI
  saida.set(segmento, 2)
  saida.set(jpeg.subarray(2), 2 + segmento.length)
  return saida
}

function contem(bytes: Uint8Array, texto: string): boolean {
  return Buffer.from(bytes).includes(Buffer.from(texto, 'latin1'))
}

function jobContext(): JobContext {
  return { onProgress: () => {}, signal: new AbortController().signal }
}

let comMetadados: Uint8Array

beforeAll(async () => {
  await initNodeCodecs()

  const { default: encode } = await import('@jsquash/jpeg/encode')
  const limpo = new Uint8Array(await encode(synthPhoto(320, 240), { quality: 90 }))
  comMetadados = comExif(limpo, MARCADOR)
}, 60_000)

describe('metadados da entrada', () => {
  it('a fixtura realmente carrega o marcador — senão o resto não prova nada', () => {
    expect(contem(comMetadados, MARCADOR)).toBe(true)
    expect(contem(comMetadados, 'Exif')).toBe(true)
  })

  const formatos: Array<Exclude<ImageFormat, 'avif'>> = ['jpeg', 'webp', 'png']

  for (const formato of formatos) {
    it(`não sobrevive à saída em ${formato}`, async () => {
      const file = new File([comMetadados as BufferSource], 'foto.jpg', { type: 'image/jpeg' })
      const options: JobOptions = {
        mode: 'auto',
        preset: 5,
        outputFormat: formato,
        quality: 82,
      }

      const result = await new ImageEngine().process(file, options, jobContext())
      const saida = new Uint8Array(await result.blob.arrayBuffer())

      expect(contem(saida, MARCADOR)).toBe(false)
      expect(contem(saida, 'Exif')).toBe(false)

      // A prova de que o arquivo continua sendo uma imagem de verdade: sem
      // isto, um encoder que devolvesse zero byte passaria neste teste.
      expect(saida.byteLength).toBeGreaterThan(100)
      expect(result.width).toBe(320)
      expect(result.height).toBe(240)
    }, 120_000)
  }
})
