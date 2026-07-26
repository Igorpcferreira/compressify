import { describe, expect, it } from 'vitest'
import {
  SUPPORTED_INPUT_EXTENSIONS,
  extensionForFormat,
  extensionOf,
  isDroppedInput,
  isSupportedInput,
  mimeTypeForFormat,
  resolveOutputFormat,
} from '@/engine/image/format'
import type { ImageFormat } from '@/engine/core/types'

describe('extensionOf', () => {
  it('devolve a extensão em minúsculas', () => {
    expect(extensionOf('FOTO.JPG')).toBe('.jpg')
  })

  it('usa apenas o último ponto', () => {
    expect(extensionOf('relatorio.anual.2026.png')).toBe('.png')
  })

  it('devolve vazio quando não há extensão', () => {
    expect(extensionOf('LEIAME')).toBe('')
  })

  it('não confunde ponto de diretório com extensão', () => {
    expect(extensionOf('pasta.v2/arquivo')).toBe('')
  })

  it('não trata arquivo oculto como extensão', () => {
    expect(extensionOf('.gitignore')).toBe('')
  })
})

describe('suporte de entrada', () => {
  it.each([...SUPPORTED_INPUT_EXTENSIONS])('aceita %s', (ext) => {
    expect(isSupportedInput(`foto${ext}`)).toBe(true)
  })

  it('recusa TIFF, que o app Electron aceitava', () => {
    expect(isSupportedInput('scan.tiff')).toBe(false)
    expect(isDroppedInput('scan.tiff')).toBe(true)
    expect(isDroppedInput('scan.tif')).toBe(true)
  })

  it('recusa formatos fora do escopo da Fase 1', () => {
    expect(isSupportedInput('video.mp4')).toBe(false)
    expect(isSupportedInput('doc.pdf')).toBe(false)
    expect(isDroppedInput('doc.pdf')).toBe(false)
  })
})

describe('resolveOutputFormat — modo smart', () => {
  it('converte tudo para WebP', () => {
    expect(resolveOutputFormat('foto.jpg', 'smart')).toBe('webp')
    expect(resolveOutputFormat('foto.png', 'smart')).toBe('webp')
    expect(resolveOutputFormat('foto.webp', 'smart')).toBe('webp')
  })

  it('mantém AVIF como AVIF', () => {
    expect(resolveOutputFormat('foto.avif', 'smart')).toBe('avif')
  })
})

describe('resolveOutputFormat — modo original', () => {
  it.each([
    ['foto.jpg', 'jpeg'],
    ['foto.jpeg', 'jpeg'],
    ['foto.png', 'png'],
    ['foto.webp', 'webp'],
    ['foto.avif', 'avif'],
  ])('mantém %s como %s', (name, expected) => {
    expect(resolveOutputFormat(name, 'original')).toBe(expected)
  })

  it('cai em JPEG para extensão desconhecida, como no Electron', () => {
    expect(resolveOutputFormat('foto.bmp', 'original')).toBe('jpeg')
    expect(resolveOutputFormat('semextensao', 'original')).toBe('jpeg')
  })
})

describe('resolveOutputFormat — formato explícito', () => {
  it.each(['jpeg', 'webp', 'avif', 'png'] as const)('respeita %s', (format) => {
    expect(resolveOutputFormat('foto.jpg', format)).toBe(format)
  })
})

describe('extensões e mime types', () => {
  it.each([
    ['jpeg', '.jpg', 'image/jpeg'],
    ['png', '.png', 'image/png'],
    ['webp', '.webp', 'image/webp'],
    ['avif', '.avif', 'image/avif'],
  ] as [ImageFormat, string, string][])('%s → %s / %s', (format, ext, mime) => {
    expect(extensionForFormat(format)).toBe(ext)
    expect(mimeTypeForFormat(format)).toBe(mime)
  })
})
