/**
 * Download individual.
 *
 * O detalhe que dá trabalho quando se erra: **revogar a URL na hora quebra o
 * download em parte dos navegadores**, porque o clique programático ainda não
 * terminou de resolver o recurso. E não revogar nunca segura o `Blob` inteiro
 * na memória — 50 resultados de 3 MB são 150 MB que só saem ao recarregar a
 * página. A saída é revogar a URL **anterior** ao criar a próxima, e ainda
 * agendar a revogação da última: no pior caso uma sobrevive.
 *
 * O atributo `download` também ignora diretórios — `pasta/foto.webp` vira
 * `foto.webp` de qualquer forma no disco. Passamos só o nome, para não
 * prometer uma estrutura que o navegador não entrega. Quem quer a árvore usa o
 * ZIP ou "Salvar em pasta".
 */

import { fileNameOf } from '@/engine/image/naming'

/** Folga antes de revogar: tempo de o navegador começar a baixar. */
const REVOKE_DELAY_MS = 60_000

let previous: string | null = null

function release(url: string): void {
  try {
    URL.revokeObjectURL(url)
  } catch {
    // Ambiente sem `URL.revokeObjectURL` (Node dos testes): nada a liberar.
  }
}

export function downloadBlob(blob: Blob, name: string): void {
  if (previous) {
    release(previous)
    previous = null
  }

  const url = URL.createObjectURL(blob)
  previous = url

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileNameOf(name)
  anchor.rel = 'noopener'
  anchor.style.display = 'none'

  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  setTimeout(() => {
    // Se `previous` já mudou, a próxima chamada revogou esta URL — revogar de
    // novo é inofensivo, mas "exatamente uma vez" é uma propriedade mais fácil
    // de verificar do que "pelo menos uma vez".
    if (previous !== url) return
    previous = null
    release(url)
  }, REVOKE_DELAY_MS)
}

/** Nome do ZIP do lote. Data no nome porque quem baixa duas vezes quer as duas. */
export function archiveName(date: Date): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ]

  return `compressify-${stamp[0]}${stamp[1]}${stamp[2]}-${stamp[3]}${stamp[4]}.zip`
}
