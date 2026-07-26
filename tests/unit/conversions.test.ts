/**
 * O catálogo de pares.
 *
 * O que estes testes protegem é menos o código e mais **o conteúdo**: doze
 * páginas geradas a partir de um molde são páginas-porta se o texto for o mesmo
 * com o nome trocado, e buscador trata página-porta como lixo — com razão. Por
 * isso aqui se verifica que cada par tem descrição própria, que o FAQ muda com
 * o que o formato de fato faz, e que a afirmação de tamanho segue a medição, não
 * a intuição de que "AVIF é sempre menor".
 */

import { describe, expect, it } from 'vitest'
import { COMPRESSION_MODES } from '@/engine/core/types'
import {
  CONVERSION_PAIRS,
  FORMATS,
  formatById,
  formatBySlug,
  growthReason,
  isLosslessTarget,
  pairBySlug,
  pairCopy,
  pairHighlight,
  tendsToGrow,
} from '@/lib/conversions'

describe('o catálogo', () => {
  it('tem os doze pares, e nenhum formato para ele mesmo', () => {
    expect(CONVERSION_PAIRS).toHaveLength(12)
    expect(CONVERSION_PAIRS.every((pair) => pair.from.id !== pair.to.id)).toBe(true)
  })

  it('tem slugs únicos e legíveis', () => {
    const slugs = CONVERSION_PAIRS.map((pair) => pair.slug)
    expect(new Set(slugs).size).toBe(slugs.length)

    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+-para-[a-z0-9]+$/)
    }

    // O slug é URL pública: `jpeg` é o nome do formato, `jpg` é o que as
    // pessoas digitam. Trocar isto quebraria endereços já indexados.
    expect(slugs).toContain('jpg-para-webp')
    expect(slugs).toContain('png-para-avif')
  })

  it('resolve slug para par e devolve undefined para o que não existe', () => {
    expect(pairBySlug('jpg-para-webp')?.to.id).toBe('webp')
    expect(pairBySlug('jpg-para-jpg')).toBeUndefined()
    expect(pairBySlug('bmp-para-png')).toBeUndefined()
    expect(pairBySlug('')).toBeUndefined()
  })

  it('cobre os quatro formatos do motor', () => {
    expect(FORMATS.map((format) => format.id).sort()).toEqual(['avif', 'jpeg', 'png', 'webp'])
    expect(formatById('jpeg').slug).toBe('jpg')
    expect(formatBySlug('jpg')?.id).toBe('jpeg')
    expect(formatBySlug('jpeg')).toBeUndefined()
  })
})

describe('o que cada destino promete', () => {
  it('só o JPG não tem modo sem perda', () => {
    for (const pair of CONVERSION_PAIRS) {
      expect(isLosslessTarget(pair)).toBe(pair.to.id !== 'jpeg')
    }
  })

  it('segue a medição, não a intuição, sobre quem cresce', () => {
    // Medido em `docs/HANDOFF-CONVERSAO.md` §6: o AVIF sem perda sai **maior**
    // que o PNG (+45% numa foto, +515% em arte chapada), e o WebP sem perda sai
    // menor (−29% e −78%). Sem esta linha, "AVIF é o mais eficiente" viraria
    // uma promessa falsa em duas landings.
    expect(tendsToGrow(pairBySlug('png-para-avif')!)).toBe(true)
    expect(tendsToGrow(pairBySlug('png-para-webp')!)).toBe(false)

    // Para JPG nunca cresce: qualidade máxima ainda é com perda.
    for (const pair of CONVERSION_PAIRS.filter((current) => current.to.id === 'jpeg')) {
      expect(tendsToGrow(pair)).toBe(false)
    }

    // Guardar sem perda o que já perdeu informação sempre custa bytes.
    expect(tendsToGrow(pairBySlug('jpg-para-png')!)).toBe(true)
    expect(tendsToGrow(pairBySlug('webp-para-png')!)).toBe(true)
  })

  it('explica o crescimento pelo motivo certo, que não é o mesmo em todo caso', () => {
    // Converter JPG para PNG cresce porque o JPG jogou informação fora.
    expect(growthReason(pairBySlug('jpg-para-png')!)).toContain('jogado informação fora')

    // Converter PNG para AVIF cresce por outra razão: o PNG não perdeu nada —
    // o lossless do AVIF é que não compete. Trocar os dois motivos seria mentir.
    const avif = growthReason(pairBySlug('png-para-avif')!)
    expect(avif).toContain('não foi feito para competir')
    expect(avif).not.toContain('jogado informação fora')

    expect(growthReason(pairBySlug('png-para-jpg')!)).toBeNull()
  })

  it('nunca chama a saída JPG de sem perda', () => {
    for (const pair of CONVERSION_PAIRS.filter((current) => current.to.id === 'jpeg')) {
      const copy = pairCopy(pair)
      const texto = [copy.description, pairHighlight(pair), ...copy.faq.map((f) => f.answer)].join(
        ' ',
      )

      expect(texto).toContain('não tem modo sem perda')
      expect(texto).not.toMatch(/sem perda nenhuma/)
    }
  })
})

describe('o texto das landings', () => {
  it('dá a cada par uma descrição própria, longa o bastante para a busca', () => {
    const descricoes = CONVERSION_PAIRS.map((pair) => pairCopy(pair).description)

    expect(new Set(descricoes).size).toBe(descricoes.length)
    for (const descricao of descricoes) {
      // O mesmo piso que o E2E cobra do `meta[name=description]`.
      expect(descricao.length).toBeGreaterThan(80)
      expect(descricao.length).toBeLessThan(320)
    }
  })

  it('varia o FAQ com o que o par realmente faz', () => {
    const cresce = pairCopy(pairBySlug('jpg-para-png')!)
    const encolhe = pairCopy(pairBySlug('png-para-jpg')!)

    expect(cresce.faq[1]?.question).toContain('maior')
    expect(encolhe.faq[1]?.question).toContain('menor')
    expect(cresce.faq).toHaveLength(4)

    // A pergunta de privacidade é igual em todas, e isso é certo: a resposta é
    // a mesma e é a mais importante do produto.
    expect(cresce.faq[2]).toEqual(encolhe.faq[2])
  })

  it('cita o número medido do WebP sem perda em vez de prometer no vago', () => {
    const copy = pairCopy(pairBySlug('png-para-webp')!)
    expect(copy.faq[1]?.answer).toContain('−29%')
  })

  it('menciona o modo Converter, que é o que as landings ligam', () => {
    // Se um dia o modo mudar de nome, este teste cai junto com o texto.
    expect(COMPRESSION_MODES).toContain('convert')
    expect(pairCopy(pairBySlug('jpg-para-webp')!).faq[0]?.answer).toContain('modo Converter')
  })
})
