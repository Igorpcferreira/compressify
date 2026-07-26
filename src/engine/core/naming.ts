/**
 * Unicidade de caminhos de saída — a parte que não é específica de imagem.
 *
 * O sufixo `-compressify` e a extensão por formato são do motor de imagem
 * (`engine/image/naming.ts`). O que mora aqui é o que qualquer motor precisa,
 * e o que o **orquestrador** precisa aplicar de novo quando o resultado chega.
 *
 * A razão está em docs/HANDOFF.md §6: cada worker tem sua própria instância de
 * motor, logo seu próprio `Set` de nomes. Dois workers processando um `foto.jpg`
 * cada — de pastas diferentes, ou soltos sem `webkitRelativePath` — produzem o
 * mesmo `foto-compressify.webp` sem saber um do outro. A reserva final é global
 * e acontece na thread principal, que é a única que vê o lote inteiro.
 */

export interface PathParts {
  /** Diretório relativo, sem barra final. Vazio na raiz. */
  dir: string
  /** Nome do arquivo sem extensão. */
  stem: string
  /** Extensão com o ponto, ou string vazia. */
  extension: string
}

export function splitPath(path: string): PathParts {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '')
  const slash = normalized.lastIndexOf('/')
  const dir = slash === -1 ? '' : normalized.slice(0, slash)
  const base = slash === -1 ? normalized : normalized.slice(slash + 1)
  const dot = base.lastIndexOf('.')

  // `dot <= 0` também cobre dotfiles: `.gitignore` é nome, não extensão.
  return {
    dir,
    stem: dot <= 0 ? base : base.slice(0, dot),
    extension: dot <= 0 ? '' : base.slice(dot),
  }
}

export function joinRelativePath(dir: string, base: string): string {
  return dir ? `${dir}/${base}` : base
}

/**
 * Reserva um caminho, acrescentando `-1`, `-2`… até não colidir.
 *
 * A comparação é em minúsculas porque Windows e macOS não distinguem caixa:
 * `Foto-compressify.webp` e `foto-compressify.webp` são o mesmo arquivo ao
 * descompactar o ZIP.
 *
 * Aplicar esta função a um caminho já reservado por outra instância é
 * idempotente no caso comum — se ninguém tomou o nome, ele volta igual — e é
 * exatamente esse o uso do orquestrador. `taken` é mutado.
 */
export function reserveUniquePath(path: string, taken: Set<string>): string {
  const { dir, stem, extension } = splitPath(path)

  let candidate = joinRelativePath(dir, `${stem}${extension}`)
  let index = 1

  while (taken.has(candidate.toLowerCase())) {
    candidate = joinRelativePath(dir, `${stem}-${index}${extension}`)
    index += 1
  }

  taken.add(candidate.toLowerCase())
  return candidate
}
