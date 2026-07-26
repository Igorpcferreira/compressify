/**
 * Resolução de formato de saída e extensões.
 * Porte de `resolveOutputFormat` / `extensionForFormat` do app Electron.
 */

import type { ImageFormat, OutputFormat } from '@/engine/core/types'

/**
 * Extensões aceitas na entrada.
 *
 * TIFF saiu em relação ao app Electron: não há decoder TIFF no jSquash e o
 * `createImageBitmap` não decodifica TIFF em Chrome nem Firefox. Ver
 * docs/PLANO.md §3.5.
 */
export const SUPPORTED_INPUT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif'] as const

export const SUPPORTED_INPUT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const

/** Extensões que o app Electron aceitava e nós não — para dar erro explicativo. */
export const DROPPED_INPUT_EXTENSIONS = ['.tif', '.tiff'] as const

export function extensionOf(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot).toLowerCase()
}

export function isSupportedInput(name: string): boolean {
  return (SUPPORTED_INPUT_EXTENSIONS as readonly string[]).includes(extensionOf(name))
}

export function isDroppedInput(name: string): boolean {
  return (DROPPED_INPUT_EXTENSIONS as readonly string[]).includes(extensionOf(name))
}

/**
 * O formato de entrada pela extensão, ou `null` quando não é um dos quatro.
 *
 * Diferente de `resolveOutputFormat(name, 'original')`, que devolve `jpeg` para
 * o que não reconhece — ali o fallback é o comportamento certo (é preciso
 * escolher **algum** formato de saída), aqui o `null` é a informação: quem
 * pergunta "que formato é este arquivo?" precisa saber quando não dá para
 * dizer, senão a interface afirmaria que um `.bmp` é JPG.
 */
export function inputFormatOf(name: string): ImageFormat | null {
  switch (extensionOf(name)) {
    case '.png':
      return 'png'
    case '.webp':
      return 'webp'
    case '.avif':
      return 'avif'
    case '.jpg':
    case '.jpeg':
      return 'jpeg'
    default:
      return null
  }
}

/**
 * Resolve `smart` e `original` para um formato concreto.
 *
 * - `smart`: converte tudo para WebP, exceto AVIF, que permanece AVIF.
 * - `original`: mantém o formato de entrada; o que não for reconhecido vira JPEG.
 *
 * Ambos os comportamentos são do app Electron, preservados.
 */
export function resolveOutputFormat(inputName: string, selected: OutputFormat): ImageFormat {
  if (selected === 'smart') {
    return extensionOf(inputName) === '.avif' ? 'avif' : 'webp'
  }

  if (selected === 'original') {
    switch (extensionOf(inputName)) {
      case '.png':
        return 'png'
      case '.webp':
        return 'webp'
      case '.avif':
        return 'avif'
      case '.jpg':
      case '.jpeg':
        return 'jpeg'
      default:
        return 'jpeg'
    }
  }

  return selected
}

export function extensionForFormat(format: ImageFormat): string {
  switch (format) {
    case 'jpeg':
      return '.jpg'
    case 'png':
      return '.png'
    case 'webp':
      return '.webp'
    case 'avif':
      return '.avif'
  }
}

export function mimeTypeForFormat(format: ImageFormat): string {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'avif':
      return 'image/avif'
  }
}
