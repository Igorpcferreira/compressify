/**
 * Dimensionamento do pool e orçamento de megapixels em voo.
 *
 * Duas contas, ambas de docs/PLANO.md §2.1:
 *
 * ```
 * workers     = clamp(hardwareConcurrency - 1, 1, 8)
 * orçamentoMP = deviceMemory ? clamp(deviceMemory * 16, 48, 160) : 96
 * ```
 *
 * O segundo limite existe porque o primeiro não protege de nada: oito workers
 * livres com fotos de 24MP são ~2,4 GB de RGBA e a aba morre. Cada job reserva
 * `largura × altura / 1e6` antes de entrar num worker e libera ao sair.
 *
 * Este módulo é puro de propósito — nenhuma referência a `Worker`, a `Blob` ou
 * a `navigator` fora de `readHardwareHints`. Separá-lo do pool é o acréscimo
 * justificado em docs/PLANO.md §7: o pool cuida de ciclo de vida de worker, o
 * orçamento cuida de aritmética, e a aritmética é o que precisa de teste.
 */

export const MIN_WORKERS = 1
export const MAX_WORKERS = 8
/** Usado quando `navigator.hardwareConcurrency` não existe (Safari antigo). */
export const DEFAULT_HARDWARE_CONCURRENCY = 4

export const MIN_MEGAPIXEL_BUDGET = 48
export const MAX_MEGAPIXEL_BUDGET = 160
/**
 * Sem `navigator.deviceMemory` — o caso do Firefox e do Safari, ou seja, a
 * maioria fora do Chromium. O padrão era 48 e subiu para 96 depois do spike:
 * com 48, um lote de 12MP só roda 4 em paralelo e o tempo dobra
 * (docs/SPIKE.md §6). Ver a nota revisada em docs/PLANO.md §2.1.
 */
export const DEFAULT_MEGAPIXEL_BUDGET = 96
/** Megapixels concedidos por GiB de memória declarada pelo dispositivo. */
export const MEGAPIXELS_PER_GIB = 16

export interface HardwareHints {
  hardwareConcurrency?: number
  /** `navigator.deviceMemory`, em GiB. Só o Chromium expõe. */
  deviceMemory?: number
}

interface HardwareNavigator {
  hardwareConcurrency?: number
  deviceMemory?: number
}

/**
 * Lê as dicas do `navigator` quando elas existem.
 *
 * Fora do navegador — nos testes, e em qualquer render de servidor que venha a
 * existir — devolve um objeto vazio, e as duas funções abaixo caem nos padrões.
 */
export function readHardwareHints(): HardwareHints {
  const nav = (globalThis as { navigator?: HardwareNavigator }).navigator
  if (!nav) return {}

  return {
    ...(typeof nav.hardwareConcurrency === 'number'
      ? { hardwareConcurrency: nav.hardwareConcurrency }
      : {}),
    ...(typeof nav.deviceMemory === 'number' ? { deviceMemory: nav.deviceMemory } : {}),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Um worker a menos que o número de núcleos: a thread principal precisa
 * continuar respondendo, que é o critério de aceite #4.
 */
export function workerCount(hints: HardwareHints = {}): number {
  const cores = Number.isFinite(hints.hardwareConcurrency)
    ? (hints.hardwareConcurrency as number)
    : DEFAULT_HARDWARE_CONCURRENCY

  return clamp(Math.floor(cores) - 1, MIN_WORKERS, MAX_WORKERS)
}

export function megapixelBudget(hints: HardwareHints = {}): number {
  if (!Number.isFinite(hints.deviceMemory) || (hints.deviceMemory as number) <= 0) {
    return DEFAULT_MEGAPIXEL_BUDGET
  }

  return clamp(
    (hints.deviceMemory as number) * MEGAPIXELS_PER_GIB,
    MIN_MEGAPIXEL_BUDGET,
    MAX_MEGAPIXEL_BUDGET,
  )
}

/** Custo de um job em megapixels. Dimensões inválidas custam zero, não NaN. */
export function megapixelsOf(size: { width: number; height: number }): number {
  const { width, height } = size
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 0
  }
  return (width * height) / 1e6
}

/**
 * Contador de megapixels reservados.
 *
 * A regra que não é óbvia: **um job maior que o orçamento inteiro roda mesmo
 * assim, sozinho**. Recusar seria pior do que tentar — uma foto de 200 MP num
 * celular de 2 GB provavelmente falha, mas a decisão é do navegador, não nossa.
 * É o que `tryReserve` faz quando nada está em voo.
 */
export class MegapixelBudget {
  readonly total: number
  private used = 0

  constructor(total: number = DEFAULT_MEGAPIXEL_BUDGET) {
    this.total = Number.isFinite(total) && total > 0 ? total : DEFAULT_MEGAPIXEL_BUDGET
  }

  get inFlight(): number {
    return this.used
  }

  get available(): number {
    return Math.max(0, this.total - this.used)
  }

  /** Verdadeiro quando o job sozinho não cabe — a UI avisa, e ele roda só. */
  exceedsTotal(cost: number): boolean {
    return cost > this.total
  }

  tryReserve(cost: number): boolean {
    const amount = Number.isFinite(cost) && cost > 0 ? cost : 0

    // Nada em voo: aceita qualquer custo, inclusive maior que o orçamento.
    // Sem esta cláusula um job grande demais ficaria preso na fila para sempre.
    if (this.used > 0 && this.used + amount > this.total) {
      return false
    }

    this.used += amount
    return true
  }

  release(cost: number): void {
    const amount = Number.isFinite(cost) && cost > 0 ? cost : 0
    this.used = Math.max(0, this.used - amount)
  }
}
