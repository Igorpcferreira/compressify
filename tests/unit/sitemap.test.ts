/**
 * O sitemap.
 *
 * Uma landing que existe e não está no sitemap é uma página que ninguém acha;
 * uma entrada no sitemap que não virou página é um 404 anunciado ao rastreador.
 * As duas metades saem da mesma lista (`CONVERSION_PAIRS`), e este teste é o
 * que prende as duas ao mesmo tempo.
 */

import { describe, expect, it } from 'vitest'
import sitemap from '../../app/sitemap'
import { CONVERSION_PAIRS } from '@/lib/conversions'
import { canonical } from '@/lib/site'

describe('sitemap', () => {
  const urls = sitemap().map((entry) => entry.url)

  it('inclui a home e as três landings escritas à mão', () => {
    expect(urls).toContain(canonical('/'))
    expect(urls).toContain(canonical('/comprimir-imagem'))
    expect(urls).toContain(canonical('/converter-webp'))
    expect(urls).toContain(canonical('/converter-avif'))
  })

  it('inclui as doze conversões, com a barra final da exportação estática', () => {
    for (const pair of CONVERSION_PAIRS) {
      expect(urls).toContain(`${canonical(`/${pair.slug}`)}`)
    }

    for (const url of urls) {
      expect(url).toMatch(/\/$/)
      expect(url.startsWith('http')).toBe(true)
    }
  })

  it('não repete endereço nenhum', () => {
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls).toHaveLength(4 + CONVERSION_PAIRS.length)
  })

  it('mantém a home com a prioridade mais alta', () => {
    const home = sitemap().find((entry) => entry.url === canonical('/'))
    expect(home?.priority).toBe(1)

    for (const entry of sitemap()) {
      expect(entry.priority ?? 0).toBeLessThanOrEqual(1)
      expect(entry.priority ?? 0).toBeGreaterThan(0)
    }
  })
})
