/**
 * Formatação de números para exibição.
 *
 * Tudo em pt-BR: o design system usa vírgula decimal ("8,4 MB", "−86%") e
 * exige JetBrains Mono com tabular-nums em todos estes valores.
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * Formata bytes em unidade legível, com vírgula decimal.
 *
 * A precisão segue o app Electron: uma casa decimal só quando o valor é menor
 * que 10 e a unidade não é bytes. "8,4 MB", "214 KB", "1,8 GB", "512 B".
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / 1024 ** exponent
  const precision = value >= 10 || exponent === 0 ? 0 : 1

  return `${value.toFixed(precision).replace('.', ',')} ${UNITS[exponent]}`
}

/**
 * Percentual de redução, com o sinal de menos tipográfico (U+2212) que o
 * design system usa nos badges: "−86%".
 *
 * Um resultado maior que o original devolve "+12%" — a UI trata isso como
 * aviso, então o número precisa dizer a verdade em vez de saturar em zero.
 */
export function formatSavedPercent(savedPercent: number): string {
  if (!Number.isFinite(savedPercent)) return '0%'
  const rounded = Math.round(savedPercent)
  if (rounded === 0) return '0%'
  return rounded > 0 ? `−${rounded}%` : `+${Math.abs(rounded)}%`
}

/** Percentual de progresso, sempre inteiro e sem sinal: "62%". */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(Math.min(100, Math.max(0, value)))}%`
}

/**
 * Duração em segundos com uma casa, como no card de arquivo:
 * "Concluído em 1,4 s". Abaixo de 1 s mostra em milissegundos.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0 ms'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
}

/** Calcula a economia relativa, protegida contra divisão por zero. */
export function savedPercentOf(originalBytes: number, compressedBytes: number): number {
  if (!Number.isFinite(originalBytes) || originalBytes <= 0) return 0
  return ((originalBytes - compressedBytes) / originalBytes) * 100
}
