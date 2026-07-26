import { describe, expect, it } from 'vitest'
import { createDefaultRegistry, createRegistry, unsupportedReason } from '@/engine/core/registry'
import type { CompressionEngine } from '@/engine/core/types'
import { ImageEngine } from '@/engine/image/engine'
import { imageFile } from '../helpers/images'

/** Motor de mentira: o registro só precisa de `id` e `supports`. */
function fakeEngine(id: string, extension: string): CompressionEngine {
  return {
    id,
    supports: (file) => file.name.toLowerCase().endsWith(extension),
    probe: () => Promise.reject(new Error('não usado')),
    process: () => Promise.reject(new Error('não usado')),
  }
}

describe('createRegistry', () => {
  it('resolve o motor pelo arquivo, não por configuração', () => {
    const imagens = fakeEngine('image', '.jpg')
    const pdf = fakeEngine('pdf', '.pdf')
    const registry = createRegistry([imagens, pdf])

    expect(registry.resolve(imageFile({ name: 'foto.jpg' }))).toBe(imagens)
    expect(registry.resolve(imageFile({ name: 'contrato.pdf' }))).toBe(pdf)
  })

  it('devolve null quando ninguém aceita', () => {
    const registry = createRegistry([fakeEngine('image', '.jpg')])
    expect(registry.resolve(imageFile({ name: 'planilha.xlsx' }))).toBeNull()
  })

  it('registra um motor novo sem tocar nos existentes', () => {
    const registry = createRegistry([fakeEngine('image', '.jpg')])
    const pdf = fakeEngine('pdf', '.pdf')

    // É assim que a Fase 2 entra: registrando, não editando o orquestrador.
    registry.register(pdf)

    expect(registry.engines).toHaveLength(2)
    expect(registry.resolve(imageFile({ name: 'contrato.pdf' }))).toBe(pdf)
  })

  it('substitui em vez de acumular quando o id se repete', () => {
    const registry = createRegistry([fakeEngine('image', '.jpg')])
    const substituto = fakeEngine('image', '.png')

    registry.register(substituto)

    expect(registry.engines).toHaveLength(1)
    expect(registry.resolve(imageFile({ name: 'arte.png' }))).toBe(substituto)
  })
})

describe('createDefaultRegistry', () => {
  it('traz o motor de imagem pronto', () => {
    const registry = createDefaultRegistry()
    const resolvido = registry.resolve(imageFile({ name: 'foto.jpg' }))

    expect(resolvido).toBeInstanceOf(ImageEngine)
    expect(resolvido?.id).toBe('image')
  })

  it('não resolve o que sai do escopo da Fase 1', () => {
    const registry = createDefaultRegistry()
    expect(registry.resolve(imageFile({ name: 'scan.tif' }))).toBeNull()
  })
})

describe('unsupportedReason', () => {
  it('explica o TIFF em vez de dar um erro genérico', () => {
    const motivo = unsupportedReason(imageFile({ name: 'scan.tiff' }))

    // O app Electron aceitava TIFF; quem arrasta um .tif merece saber por quê.
    expect(motivo).toContain('TIFF')
    expect(motivo).toContain('.tif')
  })

  it('nomeia o arquivo nos demais casos', () => {
    expect(unsupportedReason(imageFile({ name: 'planilha.xlsx' }))).toContain('planilha.xlsx')
  })
})
