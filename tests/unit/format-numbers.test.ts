import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatDuration,
  formatPercent,
  formatSavedPercent,
  savedPercentOf,
} from '@/lib/format'

describe('formatBytes', () => {
  it('usa vírgula decimal, como o design system', () => {
    expect(formatBytes(8.4 * 1024 * 1024)).toBe('8,4 MB')
  })

  it('omite decimal a partir de 10 na unidade', () => {
    expect(formatBytes(24.1 * 1024 * 1024)).toBe('24 MB')
  })

  it('nunca usa decimal em bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('escala até gigabytes', () => {
    expect(formatBytes(1.8 * 1024 ** 3)).toBe('1,8 GB')
  })

  it('trata zero e valores inválidos', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-10)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
  })

  it('reproduz os exemplos do brand board', () => {
    expect(formatBytes(1.2 * 1024 * 1024)).toBe('1,2 MB')
    expect(formatBytes(214 * 1024)).toBe('214 KB')
    expect(formatBytes(3.1 * 1024 * 1024)).toBe('3,1 MB')
  })
})

/** Sinal de menos tipográfico (U+2212), não o hífen. É o que o board usa. */
const MENOS = '−'

describe('formatSavedPercent', () => {
  it('usa o sinal de menos tipográfico do design system', () => {
    expect(formatSavedPercent(86)).toBe(`${MENOS}86%`)
  })

  it('não usa hífen comum', () => {
    expect(formatSavedPercent(86)).not.toBe('-86%')
  })

  it('mostra crescimento com sinal de mais', () => {
    expect(formatSavedPercent(-12)).toBe('+12%')
  })

  it('trata zero e inválidos', () => {
    expect(formatSavedPercent(0)).toBe('0%')
    expect(formatSavedPercent(0.4)).toBe('0%')
    expect(formatSavedPercent(Number.NaN)).toBe('0%')
  })
})

describe('formatPercent', () => {
  it('arredonda e satura entre 0 e 100', () => {
    expect(formatPercent(61.6)).toBe('62%')
    expect(formatPercent(-5)).toBe('0%')
    expect(formatPercent(150)).toBe('100%')
    expect(formatPercent(Number.NaN)).toBe('0%')
  })
})

describe('formatDuration', () => {
  it('usa segundos com uma casa acima de 1 s', () => {
    expect(formatDuration(1400)).toBe('1,4 s')
  })

  it('usa milissegundos abaixo de 1 s', () => {
    expect(formatDuration(420)).toBe('420 ms')
  })

  it('trata inválidos', () => {
    expect(formatDuration(-1)).toBe('0 ms')
    expect(formatDuration(Number.NaN)).toBe('0 ms')
  })
})

describe('savedPercentOf', () => {
  it('calcula a economia relativa', () => {
    expect(savedPercentOf(1000, 250)).toBe(75)
  })

  it('devolve negativo quando o resultado cresceu', () => {
    expect(savedPercentOf(1000, 1200)).toBeCloseTo(-20)
  })

  it('protege contra divisão por zero', () => {
    expect(savedPercentOf(0, 100)).toBe(0)
    expect(savedPercentOf(Number.NaN, 100)).toBe(0)
  })
})
