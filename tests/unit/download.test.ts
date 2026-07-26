// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { archiveName, downloadBlob } from '@/lib/download'

/**
 * O jsdom não implementa `createObjectURL` nem `revokeObjectURL`, o que é
 * conveniente: instrumentá-los é a única forma de provar a regra que importa —
 * a URL anterior é revogada, a atual **não**. Revogar na hora quebra o download
 * em parte dos navegadores; nunca revogar segura o `Blob` inteiro na memória.
 *
 * O módulo guarda a última URL de propósito, então o contador **não** é zerado
 * entre os testes: URLs repetidas fariam um teste enxergar a revogação do
 * anterior e mentir sobre a causa.
 */
const created: string[] = []
const revoked: string[] = []
let counter = 0

const clicked: string[] = []
let originalClick: () => void

beforeEach(() => {
  created.length = 0
  revoked.length = 0
  clicked.length = 0
  vi.useFakeTimers()

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => {
      counter += 1
      const url = `blob:teste/${counter}`
      created.push(url)
      return url
    },
  })

  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (url: string) => revoked.push(url),
  })

  originalClick = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    clicked.push(this.download)
  }
})

afterEach(() => {
  HTMLAnchorElement.prototype.click = originalClick
  vi.useRealTimers()
})

function blob(): Blob {
  return new Blob(['x'])
}

describe('downloadBlob', () => {
  it('dispara o clique num link e limpa o DOM', () => {
    downloadBlob(blob(), 'foto-compressify.webp')

    expect(clicked).toEqual(['foto-compressify.webp'])
    expect(document.querySelectorAll('a')).toHaveLength(0)
  })

  it('usa só o nome: o atributo download ignora diretórios', () => {
    downloadBlob(blob(), 'viagem/2026/praia-compressify.webp')

    expect(clicked).toEqual(['praia-compressify.webp'])
  })

  it('revoga a URL anterior, nunca a que acabou de criar', () => {
    downloadBlob(blob(), 'a.webp')
    downloadBlob(blob(), 'b.webp')

    const [primeira, segunda] = created
    expect(revoked).toContain(primeira)
    expect(revoked).not.toContain(segunda)
  })

  it('revoga a última por tempo, para não segurar o Blob para sempre', () => {
    downloadBlob(blob(), 'a.webp')
    const [url] = created
    expect(revoked).not.toContain(url)

    vi.advanceTimersByTime(60_000)
    expect(revoked).toContain(url)
  })

  it('revoga cada URL exatamente uma vez', () => {
    downloadBlob(blob(), 'a.webp')
    downloadBlob(blob(), 'b.webp')
    vi.advanceTimersByTime(60_000)

    for (const url of created) {
      expect(revoked.filter((current) => current === url)).toHaveLength(1)
    }
  })
})

describe('archiveName', () => {
  it('carimba data e hora, para dois downloads não colidirem', () => {
    expect(archiveName(new Date(2026, 6, 26, 9, 5))).toBe('compressify-20260726-0905.zip')
  })
})
