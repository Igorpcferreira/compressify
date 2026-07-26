/**
 * A persistência das preferências.
 *
 * O que estes testes protegem não é "salvou e leu de volta" — isso é o caso
 * fácil. É o caso hostil: `localStorage` é editável pelo usuário, sobrevive a
 * versões e pode não existir. Nada que venha de lá pode chegar ao motor sem
 * passar por validação, e nada de lá pode derrubar a aplicação.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_OPTIONS } from '@/lib/defaults'
import {
  clearPreferences,
  loadPreferences,
  PREFERENCES_KEY,
  sanitizeOptions,
  savePreferences,
} from '@/lib/preferences'

/** Um `Storage` de mentira, com gatilhos de falha. */
function fakeStorage(
  inicial: Record<string, string> = {},
  falha: { get?: boolean; set?: boolean } = {},
): Storage {
  const dados = new Map(Object.entries(inicial))

  return {
    get length() {
      return dados.size
    },
    clear: () => dados.clear(),
    key: (index: number) => [...dados.keys()][index] ?? null,
    getItem: (chave: string) => {
      if (falha.get) throw new Error('SecurityError')
      return dados.get(chave) ?? null
    },
    setItem: (chave: string, valor: string) => {
      if (falha.set) throw new Error('QuotaExceededError')
      dados.set(chave, valor)
    },
    removeItem: (chave: string) => {
      dados.delete(chave)
    },
  } as Storage
}

describe('sanitizeOptions', () => {
  it('devolve o padrão para qualquer coisa que não seja objeto', () => {
    expect(sanitizeOptions(null)).toEqual(DEFAULT_OPTIONS)
    expect(sanitizeOptions('meta')).toEqual(DEFAULT_OPTIONS)
    expect(sanitizeOptions(42)).toEqual(DEFAULT_OPTIONS)
    expect(sanitizeOptions(undefined)).toEqual(DEFAULT_OPTIONS)
  })

  it('aceita campo a campo e descarta o resto', () => {
    const resultado = sanitizeOptions({
      mode: 'target',
      outputFormat: 'avif',
      preset: 10,
      quality: 91,
      lixo: 'ignorado',
    })

    expect(resultado).toEqual({
      mode: 'target',
      preset: 10,
      outputFormat: 'avif',
      quality: 91,
    })
  })

  it('recusa valores fora do vocabulário e cai no padrão daquele campo', () => {
    const resultado = sanitizeOptions({
      mode: 'turbo',
      outputFormat: 'tiff',
      preset: 7,
      quality: 82,
    })

    expect(resultado.mode).toBe(DEFAULT_OPTIONS.mode)
    expect(resultado.outputFormat).toBe(DEFAULT_OPTIONS.outputFormat)
    expect(resultado.preset).toBe(DEFAULT_OPTIONS.preset)
  })

  it('clampa a qualidade na faixa da UI em vez de recusá-la', () => {
    // Um valor fora da faixa é intenção legível ("o menor possível"), ao
    // contrário de `mode: 'turbo'`, que não significa nada.
    expect(sanitizeOptions({ quality: 5 }).quality).toBe(35)
    expect(sanitizeOptions({ quality: 900 }).quality).toBe(95)
    expect(sanitizeOptions({ quality: 71.6 }).quality).toBe(72)
  })

  it('recusa número que não é número', () => {
    expect(sanitizeOptions({ quality: '82' }).quality).toBe(DEFAULT_OPTIONS.quality)
    expect(sanitizeOptions({ quality: Number.NaN }).quality).toBe(DEFAULT_OPTIONS.quality)
    expect(sanitizeOptions({ customTargetMb: Number.POSITIVE_INFINITY }).customTargetMb).toBe(
      undefined,
    )
  })

  it('clampa a meta personalizada na faixa do app desktop', () => {
    expect(sanitizeOptions({ customTargetMb: 0.001 }).customTargetMb).toBe(0.1)
    expect(sanitizeOptions({ customTargetMb: 10_000 }).customTargetMb).toBe(500)
  })
})

describe('loadPreferences e savePreferences', () => {
  it('faz a ida e a volta', () => {
    const storage = fakeStorage()
    const opcoes = { ...DEFAULT_OPTIONS, mode: 'target' as const, quality: 60 }

    savePreferences(opcoes, storage)
    expect(loadPreferences(storage)).toEqual(opcoes)
  })

  it('usa o padrão quando não há nada guardado', () => {
    expect(loadPreferences(fakeStorage())).toEqual(DEFAULT_OPTIONS)
  })

  it('usa o padrão quando o valor guardado não é JSON', () => {
    const storage = fakeStorage({ [PREFERENCES_KEY]: '{quebrado' })
    expect(loadPreferences(storage)).toEqual(DEFAULT_OPTIONS)
  })

  it('valida o que leu — JSON válido com conteúdo inválido não passa', () => {
    const storage = fakeStorage({
      [PREFERENCES_KEY]: JSON.stringify({ mode: 'target', quality: 'muita' }),
    })

    const resultado = loadPreferences(storage)
    expect(resultado.mode).toBe('target')
    expect(resultado.quality).toBe(DEFAULT_OPTIONS.quality)
  })

  it('sobrevive a um armazenamento que não existe', () => {
    expect(loadPreferences(null)).toEqual(DEFAULT_OPTIONS)
    expect(() => savePreferences(DEFAULT_OPTIONS, null)).not.toThrow()
    expect(() => clearPreferences(null)).not.toThrow()
  })

  it('sobrevive a um armazenamento que lança', () => {
    // Modo privativo do Safari lança em `setItem`; política de cookies lança
    // até em leitura. Perder a preferência é aceitável; quebrar não é.
    expect(loadPreferences(fakeStorage({}, { get: true }))).toEqual(DEFAULT_OPTIONS)
    expect(() => savePreferences(DEFAULT_OPTIONS, fakeStorage({}, { set: true }))).not.toThrow()
  })

  it('guarda só a configuração — nada sobre os arquivos', () => {
    const storage = fakeStorage()
    savePreferences({ ...DEFAULT_OPTIONS, quality: 70 }, storage)

    const guardado = JSON.parse(storage.getItem(PREFERENCES_KEY) as string) as Record<
      string,
      unknown
    >

    // A promessa de privacidade vale para o armazenamento local também: se um
    // dia alguém acrescentar "últimos arquivos" aqui, este teste é o que
    // obriga a decisão a ser consciente.
    expect(Object.keys(guardado).sort()).toEqual(['mode', 'outputFormat', 'preset', 'quality'])
  })

  it('limpa o que guardou', () => {
    const storage = fakeStorage()
    savePreferences(DEFAULT_OPTIONS, storage)
    clearPreferences(storage)
    expect(storage.getItem(PREFERENCES_KEY)).toBeNull()
  })
})
