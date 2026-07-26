/**
 * Nomenclatura dos arquivos de saída.
 *
 * Porte de `buildOutputPath` / `createUniquePath` do app Electron. Duas
 * garantias são preservadas: o sufixo `-compressify` e a desambiguação por
 * índice, que juntas asseguram que nada é sobrescrito.
 *
 * Caminhos aqui são sempre relativos e com barra normal — é o formato de
 * `webkitRelativePath` e o que o ZIP espera.
 */

import type { ImageFormat } from '@/engine/core/types'
import { extensionForFormat } from './format'

export const OUTPUT_SUFFIX = '-compressify'

interface SplitPath {
  /** Diretório relativo, sem barra final. Vazio na raiz. */
  dir: string
  /** Nome do arquivo sem extensão. */
  stem: string
}

export function splitRelativePath(relativePath: string): SplitPath {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const slash = normalized.lastIndexOf('/')
  const dir = slash === -1 ? '' : normalized.slice(0, slash)
  const base = slash === -1 ? normalized : normalized.slice(slash + 1)
  const dot = base.lastIndexOf('.')
  const stem = dot <= 0 ? base : base.slice(0, dot)
  return { dir, stem }
}

export function joinRelativePath(dir: string, base: string): string {
  return dir ? `${dir}/${base}` : base
}

/**
 * Monta o caminho de saída, garantindo unicidade contra os nomes já
 * produzidos nesta sessão.
 *
 * O incremento replica a peculiaridade do original: o índice é aplicado sobre
 * o nome **já sufixado**, então a segunda colisão de `foto.jpg` vira
 * `foto-compressify-1.jpg`, não `foto-1-compressify.jpg`.
 *
 * `taken` é mutado — o chamador mantém um único Set por lote.
 */
export function buildOutputPath(
  relativePath: string,
  format: ImageFormat,
  taken: Set<string>,
): string {
  const { dir, stem } = splitRelativePath(relativePath)
  const extension = extensionForFormat(format)
  const baseName = `${stem}${OUTPUT_SUFFIX}`

  let candidate = joinRelativePath(dir, `${baseName}${extension}`)
  let index = 1

  while (taken.has(candidate.toLowerCase())) {
    candidate = joinRelativePath(dir, `${baseName}-${index}${extension}`)
    index += 1
  }

  taken.add(candidate.toLowerCase())
  return candidate
}

/** Nome exibido na UI e usado no download individual — sem o diretório. */
export function fileNameOf(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}
