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

import { joinRelativePath, reserveUniquePath, splitPath } from '@/engine/core/naming'
import type { ImageFormat } from '@/engine/core/types'
import { extensionForFormat } from './format'

export { joinRelativePath }

export const OUTPUT_SUFFIX = '-compressify'

interface SplitPath {
  /** Diretório relativo, sem barra final. Vazio na raiz. */
  dir: string
  /** Nome do arquivo sem extensão. */
  stem: string
}

export function splitRelativePath(relativePath: string): SplitPath {
  const { dir, stem } = splitPath(relativePath)
  return { dir, stem }
}

/**
 * Monta o caminho de saída, garantindo unicidade contra os nomes já
 * produzidos nesta sessão.
 *
 * O incremento replica a peculiaridade do original: o índice é aplicado sobre
 * o nome **já sufixado**, então a segunda colisão de `foto.jpg` vira
 * `foto-compressify-1.jpg`, não `foto-1-compressify.jpg`.
 *
 * `taken` é mutado — o chamador mantém um único Set por lote. Dentro de um
 * worker esse Set é local, então o orquestrador reserva de novo, globalmente,
 * quando o resultado chega (docs/HANDOFF.md §6).
 */
export function buildOutputPath(
  relativePath: string,
  format: ImageFormat,
  taken: Set<string>,
): string {
  const { dir, stem } = splitRelativePath(relativePath)
  const baseName = `${stem}${OUTPUT_SUFFIX}${extensionForFormat(format)}`
  return reserveUniquePath(joinRelativePath(dir, baseName), taken)
}

/** Nome exibido na UI e usado no download individual — sem o diretório. */
export function fileNameOf(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}
