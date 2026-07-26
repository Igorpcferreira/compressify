import { describe, expect, it } from 'vitest'
import { reserveUniquePath, splitPath } from '@/engine/core/naming'

describe('splitPath', () => {
  it('separa diretório, nome e extensão', () => {
    expect(splitPath('fotos/2026/praia-compressify.webp')).toEqual({
      dir: 'fotos/2026',
      stem: 'praia-compressify',
      extension: '.webp',
    })
  })

  it('normaliza barras invertidas e barra inicial', () => {
    expect(splitPath('\\fotos\\praia.jpg')).toEqual({
      dir: 'fotos',
      stem: 'praia',
      extension: '.jpg',
    })
  })

  it('não trata dotfile como extensão', () => {
    expect(splitPath('.gitignore')).toEqual({ dir: '', stem: '.gitignore', extension: '' })
  })
})

describe('reserveUniquePath', () => {
  it('devolve o caminho intacto quando ninguém o tomou', () => {
    const taken = new Set<string>()
    expect(reserveUniquePath('praia-compressify.webp', taken)).toBe('praia-compressify.webp')
  })

  it('incrementa o índice a cada colisão', () => {
    const taken = new Set<string>()

    expect(reserveUniquePath('praia-compressify.webp', taken)).toBe('praia-compressify.webp')
    expect(reserveUniquePath('praia-compressify.webp', taken)).toBe('praia-compressify-1.webp')
    expect(reserveUniquePath('praia-compressify.webp', taken)).toBe('praia-compressify-2.webp')
  })

  it('não colide entre pastas diferentes', () => {
    const taken = new Set<string>()

    expect(reserveUniquePath('a/praia-compressify.webp', taken)).toBe('a/praia-compressify.webp')
    expect(reserveUniquePath('b/praia-compressify.webp', taken)).toBe('b/praia-compressify.webp')
  })

  it('ignora a caixa ao comparar — Windows e macOS não distinguem', () => {
    const taken = new Set<string>()

    expect(reserveUniquePath('Praia-compressify.webp', taken)).toBe('Praia-compressify.webp')
    expect(reserveUniquePath('PRAIA-compressify.webp', taken)).toBe('PRAIA-compressify-1.webp')
  })

  it('é idempotente para o caminho que já tem índice', () => {
    // O motor dentro do worker já desambiguou entre os jobs *daquele* worker;
    // o orquestrador reserva de novo e não deve mexer no que já está livre.
    const taken = new Set<string>(['praia-compressify.webp'])
    expect(reserveUniquePath('praia-compressify-1.webp', taken)).toBe('praia-compressify-1.webp')
  })
})
