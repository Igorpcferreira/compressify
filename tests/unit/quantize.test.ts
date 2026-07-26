import { describe, expect, it } from 'vitest'
import {
  PALETTE_QUALITY_THRESHOLD,
  paletteSizeForQuality,
  quantize,
  shouldQuantize,
} from '@/engine/image/quantize'

function contarCores(data: Uint8ClampedArray): number {
  const cores = new Set<number>()
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) === 0) continue
    cores.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0))
  }
  return cores.size
}

/** Gradiente de cor contínua — milhares de cores distintas. */
function gradiente(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      data[i] = (x * 255) / width
      data[i + 1] = (y * 255) / height
      data[i + 2] = ((x + y) * 255) / (width + height)
      data[i + 3] = 255
    }
  }
  return data
}

/** Imagem com exatamente `n` cores distintas, distribuídas em blocos. */
function poucasCores(width: number, height: number, n: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4
    const c = p % n
    data[i] = (c * 37) % 256
    data[i + 1] = (c * 91) % 256
    data[i + 2] = (c * 143) % 256
    data[i + 3] = 255
  }
  return data
}

describe('shouldQuantize', () => {
  it('usa o mesmo limiar 88 do Sharp', () => {
    expect(shouldQuantize(87)).toBe(true)
    expect(shouldQuantize(PALETTE_QUALITY_THRESHOLD)).toBe(false)
    expect(shouldQuantize(95)).toBe(false)
  })
})

describe('paletteSizeForQuality', () => {
  it('devolve sempre potências de dois entre 32 e 256', () => {
    for (let q = 24; q < PALETTE_QUALITY_THRESHOLD; q += 1) {
      const size = paletteSizeForQuality(q)
      expect(size).toBeGreaterThanOrEqual(32)
      expect(size).toBeLessThanOrEqual(256)
      expect(Number.isInteger(Math.log2(size))).toBe(true)
    }
  })

  it('cresce monotonicamente com a qualidade', () => {
    let anterior = 0
    for (let q = 24; q < PALETTE_QUALITY_THRESHOLD; q += 1) {
      const size = paletteSizeForQuality(q)
      expect(size).toBeGreaterThanOrEqual(anterior)
      anterior = size
    }
  })

  it('ancora nos extremos', () => {
    expect(paletteSizeForQuality(24)).toBe(32)
    expect(paletteSizeForQuality(87)).toBe(256)
  })
})

describe('quantize', () => {
  it('reduz um gradiente ao número de cores pedido', () => {
    const width = 128
    const height = 128
    const data = gradiente(width, height)
    expect(contarCores(data)).toBeGreaterThan(256)

    const resultado = quantize(data, width, height, { colors: 64 })

    expect(contarCores(resultado.data)).toBeLessThanOrEqual(64)
    expect(resultado.paletteSize).toBeLessThanOrEqual(64)
  })

  it('deixa intacta uma imagem que já cabe na paleta', () => {
    const width = 32
    const height = 32
    const data = poucasCores(width, height, 8)
    const antes = Uint8ClampedArray.from(data)

    quantize(data, width, height, { colors: 256 })

    expect(Array.from(data)).toEqual(Array.from(antes))
  })

  it('preserva as dimensões e o tamanho do buffer', () => {
    const width = 64
    const height = 48
    const data = gradiente(width, height)
    const tamanho = data.length

    const resultado = quantize(data, width, height, { colors: 32 })

    expect(resultado.data.length).toBe(tamanho)
    expect(resultado.data).toBe(data) // muta in-place
  })

  it('resolve o alfa por limiar: transparente ou opaco, nunca intermediário', () => {
    const width = 8
    const height = 8
    const data = gradiente(width, height)
    for (let p = 0; p < width * height; p += 1) {
      data[p * 4 + 3] = p % 256
    }

    const resultado = quantize(data, width, height, { colors: 32 })

    for (let p = 0; p < width * height; p += 1) {
      const alfa = resultado.data[p * 4 + 3]
      expect(alfa === 0 || alfa === 255).toBe(true)
    }
  })

  it('zera completamente os pixels que viram transparentes', () => {
    const width = 4
    const height = 4
    const data = gradiente(width, height)
    for (let p = 0; p < width * height; p += 1) data[p * 4 + 3] = 10

    const resultado = quantize(data, width, height, { colors: 32 })

    for (let p = 0; p < width * height; p += 1) {
      expect(resultado.data[p * 4]).toBe(0)
      expect(resultado.data[p * 4 + 1]).toBe(0)
      expect(resultado.data[p * 4 + 2]).toBe(0)
      expect(resultado.data[p * 4 + 3]).toBe(0)
    }
  })

  it('mantém as cores próximas das originais', () => {
    const width = 64
    const height = 64
    const original = gradiente(width, height)
    const copia = Uint8ClampedArray.from(original)

    quantize(copia, width, height, { colors: 256 })

    let erroTotal = 0
    for (let i = 0; i < original.length; i += 4) {
      erroTotal +=
        Math.abs((original[i] ?? 0) - (copia[i] ?? 0)) +
        Math.abs((original[i + 1] ?? 0) - (copia[i + 1] ?? 0)) +
        Math.abs((original[i + 2] ?? 0) - (copia[i + 2] ?? 0))
    }
    const erroMedioPorCanal = erroTotal / ((original.length / 4) * 3)

    // Com 256 cores num gradiente suave o erro médio precisa ser pequeno.
    // O balde do histograma tem 8 níveis de largura, então ~4 é o piso teórico.
    expect(erroMedioPorCanal).toBeLessThan(8)
  })

  it('lida com imagem totalmente transparente sem quebrar', () => {
    const width = 8
    const height = 8
    const data = new Uint8ClampedArray(width * height * 4)

    const resultado = quantize(data, width, height, { colors: 32 })

    expect(resultado.paletteSize).toBe(0)
  })

  it('lida com imagem de cor única', () => {
    const width = 16
    const height = 16
    const data = new Uint8ClampedArray(width * height * 4)
    for (let p = 0; p < width * height; p += 1) {
      data[p * 4] = 120
      data[p * 4 + 1] = 80
      data[p * 4 + 2] = 200
      data[p * 4 + 3] = 255
    }

    const resultado = quantize(data, width, height, { colors: 32 })

    expect(contarCores(resultado.data)).toBe(1)
    expect(resultado.paletteSize).toBe(1)
  })

  it('respeita paletas pequenas', () => {
    const width = 64
    const height = 64
    const data = gradiente(width, height)

    const resultado = quantize(data, width, height, { colors: 4 })

    expect(contarCores(resultado.data)).toBeLessThanOrEqual(4)
  })

  it('é determinístico', () => {
    const width = 48
    const height = 48
    const a = gradiente(width, height)
    const b = gradiente(width, height)

    quantize(a, width, height, { colors: 64 })
    quantize(b, width, height, { colors: 64 })

    expect(Array.from(a)).toEqual(Array.from(b))
  })
})
