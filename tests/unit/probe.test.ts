import { describe, expect, it } from 'vitest'
import { isDeepPng, readImageHeader, sniffFormat } from '@/engine/image/probe'
import {
  avifHeader,
  jpegHeader,
  pngHeader,
  webpExtendedHeader,
  webpLosslessHeader,
  webpLossyHeader,
} from '../helpers/images'

describe('sniffFormat', () => {
  it('reconhece os quatro formatos de entrada pelos bytes mágicos', () => {
    expect(sniffFormat(pngHeader({ width: 10, height: 10 }))).toBe('png')
    expect(sniffFormat(jpegHeader({ width: 10, height: 10 }))).toBe('jpeg')
    expect(sniffFormat(webpLossyHeader({ width: 10, height: 10 }))).toBe('webp')
    expect(sniffFormat(avifHeader({ width: 10, height: 10 }))).toBe('avif')
  })

  it('não se deixa levar pela extensão — só pelos bytes', () => {
    // O caso real: um PNG renomeado para .jpg. Escolher o decoder pela
    // extensão falharia com uma mensagem incompreensível.
    expect(sniffFormat(pngHeader({ width: 4000, height: 3000 }))).toBe('png')
  })

  it('devolve null para conteúdo desconhecido ou vazio', () => {
    expect(sniffFormat(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull()
    expect(sniffFormat(new Uint8Array(0))).toBeNull()
  })

  it('não confunde outro ISOBMFF com AVIF', () => {
    // Um MP4 também começa com `ftyp`; a marca é que decide.
    const mp4 = new Uint8Array([
      0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 0x6d, 0x70, 0x34,
      0x32,
    ])
    expect(sniffFormat(mp4)).toBeNull()
  })
})

describe('readImageHeader — PNG', () => {
  it('lê dimensões e profundidade', () => {
    const header = readImageHeader(pngHeader({ width: 4032, height: 3024 }))
    expect(header).toEqual({ format: 'png', width: 4032, height: 3024, bitDepth: 8 })
  })

  it('identifica PNG de 16 bits', () => {
    const header = readImageHeader(pngHeader({ width: 800, height: 600, bitDepth: 16 }))
    expect(header?.bitDepth).toBe(16)
    expect(isDeepPng(header)).toBe(true)
  })

  it('não marca PNG de 8 bits como profundo', () => {
    expect(isDeepPng(readImageHeader(pngHeader({ width: 10, height: 10 })))).toBe(false)
    expect(isDeepPng(null)).toBe(false)
  })

  it('devolve null quando o IHDR não está onde deveria', () => {
    const truncado = pngHeader({ width: 100, height: 100 }).slice(0, 20)
    expect(readImageHeader(truncado)).toBeNull()
  })
})

describe('readImageHeader — JPEG', () => {
  it('lê dimensões do SOF0', () => {
    const header = readImageHeader(jpegHeader({ width: 6000, height: 4000 }))
    expect(header).toEqual({ format: 'jpeg', width: 6000, height: 4000, bitDepth: 8 })
  })

  it('atravessa um bloco EXIF grande antes do quadro', () => {
    // Caso real: foto de celular com APP1 de dezenas de KB antes do SOF.
    const header = readImageHeader(jpegHeader({ width: 4032, height: 3024, exifBytes: 60_000 }))
    expect(header?.width).toBe(4032)
    expect(header?.height).toBe(3024)
  })

  it('reconhece JPEG progressivo', () => {
    const header = readImageHeader(jpegHeader({ width: 1920, height: 1080, marker: 0xc2 }))
    expect(header?.width).toBe(1920)
  })

  it('não confunde marcador de tabela Huffman com quadro', () => {
    // 0xC4 está na faixa 0xC0–0xCF mas é DHT, não SOF.
    const header = readImageHeader(jpegHeader({ width: 640, height: 480, marker: 0xc4 }))
    expect(header).toBeNull()
  })

  it('desiste quando a varredura começa sem SOF', () => {
    const semQuadro = new Uint8Array([
      0xff, 0xd8, 0xff, 0xda, 0x00, 0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ])
    expect(readImageHeader(semQuadro)).toBeNull()
  })
})

describe('readImageHeader — WebP', () => {
  it('lê a variante com perda', () => {
    expect(readImageHeader(webpLossyHeader({ width: 1600, height: 1200 }))).toEqual({
      format: 'webp',
      width: 1600,
      height: 1200,
      bitDepth: null,
    })
  })

  it('lê a variante sem perda', () => {
    expect(readImageHeader(webpLosslessHeader({ width: 1024, height: 768 }))?.width).toBe(1024)
    expect(readImageHeader(webpLosslessHeader({ width: 1024, height: 768 }))?.height).toBe(768)
  })

  it('lê a variante estendida, que é a de arquivos com alfa', () => {
    expect(readImageHeader(webpExtendedHeader({ width: 3840, height: 2160 }))).toEqual({
      format: 'webp',
      width: 3840,
      height: 2160,
      bitDepth: null,
    })
  })

  it('respeita o teto de 14 bits do formato', () => {
    const header = readImageHeader(webpLossyHeader({ width: 16383, height: 16383 }))
    expect(header?.width).toBe(16383)
    expect(header?.height).toBe(16383)
  })
})

describe('readImageHeader — AVIF', () => {
  it('lê as dimensões da caixa ispe', () => {
    expect(readImageHeader(avifHeader({ width: 2048, height: 1536 }))).toEqual({
      format: 'avif',
      width: 2048,
      height: 1536,
      bitDepth: null,
    })
  })

  it('escolhe a maior ispe quando há miniatura ou item auxiliar', () => {
    const header = readImageHeader(
      avifHeader({
        width: 4000,
        height: 3000,
        extraSizes: [
          { width: 320, height: 240 },
          { width: 160, height: 120 },
        ],
      }),
    )
    expect(header?.width).toBe(4000)
    expect(header?.height).toBe(3000)
  })

  it('devolve null quando não há ispe legível', () => {
    const semIspe = new Uint8Array([
      0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0, 0x6d, 0x69, 0x66,
      0x31,
    ])
    expect(readImageHeader(semIspe)).toBeNull()
  })
})
