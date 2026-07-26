import { describe, expect, it } from 'vitest'
import {
  OUTPUT_SUFFIX,
  buildOutputPath,
  fileNameOf,
  joinRelativePath,
  splitRelativePath,
} from '@/engine/image/naming'

describe('splitRelativePath', () => {
  it('separa diretório e nome sem extensão', () => {
    expect(splitRelativePath('fotos/2026/praia.jpg')).toEqual({
      dir: 'fotos/2026',
      stem: 'praia',
    })
  })

  it('lida com arquivo na raiz', () => {
    expect(splitRelativePath('praia.jpg')).toEqual({ dir: '', stem: 'praia' })
  })

  it('normaliza barras invertidas do Windows', () => {
    expect(splitRelativePath('fotos\\2026\\praia.jpg')).toEqual({
      dir: 'fotos/2026',
      stem: 'praia',
    })
  })

  it('preserva pontos internos do nome', () => {
    expect(splitRelativePath('relatorio.anual.2026.png').stem).toBe('relatorio.anual.2026')
  })

  it('trata arquivo sem extensão', () => {
    expect(splitRelativePath('LEIAME')).toEqual({ dir: '', stem: 'LEIAME' })
  })

  it('trata arquivo oculto sem extensão', () => {
    expect(splitRelativePath('.gitignore')).toEqual({ dir: '', stem: '.gitignore' })
  })
})

describe('joinRelativePath', () => {
  it('junta com barra', () => {
    expect(joinRelativePath('a/b', 'c.jpg')).toBe('a/b/c.jpg')
  })

  it('omite a barra na raiz', () => {
    expect(joinRelativePath('', 'c.jpg')).toBe('c.jpg')
  })
})

describe('buildOutputPath', () => {
  it('aplica o sufixo e a extensão do formato de saída', () => {
    const taken = new Set<string>()
    expect(buildOutputPath('praia.jpg', 'webp', taken)).toBe(`praia${OUTPUT_SUFFIX}.webp`)
  })

  it('preserva a estrutura relativa de subpastas', () => {
    const taken = new Set<string>()
    expect(buildOutputPath('fotos/2026/praia.jpg', 'jpeg', taken)).toBe(
      `fotos/2026/praia${OUTPUT_SUFFIX}.jpg`,
    )
  })

  it('desambigua colisões incrementando o índice', () => {
    const taken = new Set<string>()
    expect(buildOutputPath('praia.jpg', 'webp', taken)).toBe('praia-compressify.webp')
    expect(buildOutputPath('praia.png', 'webp', taken)).toBe('praia-compressify-1.webp')
    expect(buildOutputPath('praia.avif', 'webp', taken)).toBe('praia-compressify-2.webp')
  })

  it('aplica o índice sobre o nome já sufixado, como o app Electron', () => {
    const taken = new Set<string>()
    buildOutputPath('praia.jpg', 'webp', taken)
    // E não 'praia-1-compressify.webp'.
    expect(buildOutputPath('praia.jpg', 'webp', taken)).toBe('praia-compressify-1.webp')
  })

  it('trata colisão sem diferenciar maiúsculas — sistemas de arquivo do Windows', () => {
    const taken = new Set<string>()
    expect(buildOutputPath('Praia.jpg', 'webp', taken)).toBe('Praia-compressify.webp')
    expect(buildOutputPath('PRAIA.jpg', 'webp', taken)).toBe('PRAIA-compressify-1.webp')
  })

  it('não confunde nomes iguais em pastas diferentes', () => {
    const taken = new Set<string>()
    expect(buildOutputPath('a/praia.jpg', 'webp', taken)).toBe('a/praia-compressify.webp')
    expect(buildOutputPath('b/praia.jpg', 'webp', taken)).toBe('b/praia-compressify.webp')
  })

  it('registra o nome escolhido no conjunto recebido', () => {
    const taken = new Set<string>()
    buildOutputPath('praia.jpg', 'webp', taken)
    expect(taken.has('praia-compressify.webp')).toBe(true)
  })
})

describe('fileNameOf', () => {
  it('devolve só o nome do arquivo', () => {
    expect(fileNameOf('fotos/2026/praia.jpg')).toBe('praia.jpg')
    expect(fileNameOf('praia.jpg')).toBe('praia.jpg')
    expect(fileNameOf('fotos\\praia.jpg')).toBe('praia.jpg')
  })
})
