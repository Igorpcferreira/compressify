import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MEGAPIXEL_BUDGET,
  MAX_MEGAPIXEL_BUDGET,
  MAX_WORKERS,
  MegapixelBudget,
  MIN_MEGAPIXEL_BUDGET,
  MIN_WORKERS,
  megapixelBudget,
  megapixelsOf,
  workerCount,
} from '@/engine/core/budget'

describe('workerCount', () => {
  it('deixa um núcleo para a thread principal', () => {
    expect(workerCount({ hardwareConcurrency: 8 })).toBe(7)
    expect(workerCount({ hardwareConcurrency: 4 })).toBe(3)
  })

  it('respeita o piso e o teto', () => {
    expect(workerCount({ hardwareConcurrency: 1 })).toBe(MIN_WORKERS)
    expect(workerCount({ hardwareConcurrency: 32 })).toBe(MAX_WORKERS)
  })

  it('cai no padrão quando o navegador não informa', () => {
    expect(workerCount()).toBe(3)
    expect(workerCount({ hardwareConcurrency: Number.NaN })).toBe(3)
  })
})

describe('megapixelBudget', () => {
  it('escala com a memória declarada', () => {
    expect(megapixelBudget({ deviceMemory: 8 })).toBe(128)
  })

  it('respeita o piso e o teto', () => {
    expect(megapixelBudget({ deviceMemory: 1 })).toBe(MIN_MEGAPIXEL_BUDGET)
    expect(megapixelBudget({ deviceMemory: 64 })).toBe(MAX_MEGAPIXEL_BUDGET)
  })

  it('usa 96 quando deviceMemory não existe — Firefox e Safari', () => {
    expect(megapixelBudget()).toBe(DEFAULT_MEGAPIXEL_BUDGET)
    expect(megapixelBudget({ deviceMemory: 0 })).toBe(DEFAULT_MEGAPIXEL_BUDGET)
  })
})

describe('megapixelsOf', () => {
  it('converte dimensões em megapixels', () => {
    expect(megapixelsOf({ width: 4000, height: 3000 })).toBe(12)
  })

  it('não produz NaN com dimensões inválidas', () => {
    expect(megapixelsOf({ width: 0, height: 100 })).toBe(0)
    expect(megapixelsOf({ width: Number.NaN, height: 100 })).toBe(0)
  })
})

describe('MegapixelBudget', () => {
  it('aceita reservas até o total', () => {
    const budget = new MegapixelBudget(96)

    expect(budget.tryReserve(48)).toBe(true)
    expect(budget.tryReserve(48)).toBe(true)
    expect(budget.inFlight).toBe(96)
    expect(budget.available).toBe(0)
  })

  it('recusa o que não cabe e aceita depois da liberação', () => {
    const budget = new MegapixelBudget(96)
    budget.tryReserve(90)

    expect(budget.tryReserve(12)).toBe(false)

    budget.release(90)
    expect(budget.tryReserve(12)).toBe(true)
  })

  it('deixa um job maior que o orçamento rodar sozinho', () => {
    const budget = new MegapixelBudget(96)

    // 200 MP com o orçamento vazio: passa, porque recusar seria condenar o job
    // a esperar para sempre. Ver docs/PLANO.md §2.1.
    expect(budget.exceedsTotal(200)).toBe(true)
    expect(budget.tryReserve(200)).toBe(true)

    // E enquanto ele roda, mais ninguém entra.
    expect(budget.tryReserve(1)).toBe(false)
  })

  it('não fica com saldo negativo ao liberar demais', () => {
    const budget = new MegapixelBudget(96)
    budget.tryReserve(10)
    budget.release(50)

    expect(budget.inFlight).toBe(0)
  })

  it('trata custo inválido como zero', () => {
    const budget = new MegapixelBudget(96)

    expect(budget.tryReserve(Number.NaN)).toBe(true)
    expect(budget.inFlight).toBe(0)
  })
})
