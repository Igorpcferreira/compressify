/**
 * A estratégia de compressão — o ativo intelectual do projeto.
 *
 * Porte direto de `src/main/index.ts` do app Electron (preservado na tag
 * v1.0.0-electron), com duas mudanças deliberadas documentadas em
 * docs/PLANO.md §3.1 e §3.3.
 *
 * Este módulo não importa WASM, canvas nem DOM. Ele recebe uma função
 * `Renderer` e não sabe o que há do outro lado: em produção são os codecs,
 * nos testes é um modelo de tamanho sintético. É o que torna o algoritmo
 * testável de verdade, com casos de borda, sem carregar 3,4 MB de WASM.
 */

/** Qualidade mínima que a busca binária pode escolher. */
export const QUALITY_MIN = 24
/** Qualidade máxima, mesmo que o usuário peça mais. */
export const QUALITY_MAX = 95

/**
 * Degraus do modo automático. A qualidade pedida pelo usuário é injetada
 * neste conjunto, não o substitui — comportamento do app Electron.
 */
export const QUALITY_LADDER = [82, 74, 66, 58, 48, 38] as const

/** Iterações da busca binária por nível de escala. */
export const TARGET_SEARCH_ITERATIONS = 7
/** Níveis de redução de resolução tentados antes de desistir. */
export const MAX_SCALE_ATTEMPTS = 8
/** Cada nível reduz a resolução em 16%. */
export const SCALE_STEP = 0.84
/** Piso de resolução: nenhum lado desce abaixo disto. Ver §3.3 do plano. */
export const MIN_DIMENSION = 900
/**
 * Mesmo que a meta seja maior que o original, exigimos ao menos 2% de
 * redução — senão "comprimir" devolveria o arquivo praticamente intacto.
 */
export const TARGET_HEADROOM = 0.98

export const MESSAGES = {
  automaticFloor: 'Não foi possível reduzir mais sem uma compressão agressiva.',
  targetFloor: 'A imagem foi comprimida no limite possível para as opções selecionadas.',
  timeout: 'Interrompido pelo limite de tempo. Este é o menor tamanho alcançado.',
} as const

export interface RenderAttempt {
  quality: number
  /** 1 = resolução original. 0,84 = um nível de redução. */
  scale: number
}

export type Renderer = (attempt: RenderAttempt) => Promise<Uint8Array>

export interface StrategyContext {
  signal?: AbortSignal
  /** Verdadeiro quando o orçamento de tempo do job acabou (docs/PLANO.md §2.2.1). */
  isExpired?: () => boolean
}

export interface RenderOutcome {
  bytes: Uint8Array
  /** Combinação que produziu este resultado. */
  attempt: RenderAttempt
  /** Quantos encodes foram executados — usado para progresso e para os testes. */
  encodes: number
  warning?: string
}

interface Candidate {
  bytes: Uint8Array
  attempt: RenderAttempt
}

/** Erro lançado quando o usuário cancela a fila. */
export class AbortedError extends Error {
  constructor() {
    super('Operação cancelada.')
    this.name = 'AbortedError'
  }
}

export function clampQuality(value: number): number {
  if (!Number.isFinite(value)) return QUALITY_MIN
  return Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, value))
}

/**
 * Monta os degraus do modo automático: a qualidade pedida entra no conjunto,
 * tudo é clampado, deduplicado e ordenado do maior para o menor.
 *
 * Com qualidade 90 → [90, 82, 74, 66, 58, 48, 38].
 * Com qualidade 60 → [82, 74, 66, 60, 58, 48, 38].
 */
export function qualitySteps(requestedQuality: number): number[] {
  const all = [requestedQuality, ...QUALITY_LADDER].map((value) => clampQuality(Math.round(value)))
  return [...new Set(all)].sort((a, b) => b - a)
}

/**
 * Um nível de redução só é aceito se as dimensões **resultantes** ficarem em
 * 900px ou mais nos dois lados.
 *
 * Diferença deliberada em relação ao Electron: lá o teste era feito sobre a
 * escala *atual*, antes de multiplicar, o que deixava o piso efetivo cair para
 * ~756px. Ver docs/PLANO.md §3.3.
 *
 * A conjunção sobre os dois lados é preservada do original: uma imagem cujo
 * lado menor já está abaixo do piso nunca é redimensionada.
 */
export function canScale(width: number, height: number, nextScale: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false
  }
  return (
    Math.floor(width * nextScale) >= MIN_DIMENSION &&
    Math.floor(height * nextScale) >= MIN_DIMENSION
  )
}

/** Meta efetiva: nunca maior que 98% do original, nunca menor que 1 KB. */
export function effectiveTargetBytes(originalBytes: number, targetBytes: number): number {
  return Math.min(targetBytes, Math.max(1024, Math.floor(originalBytes * TARGET_HEADROOM)))
}

function checkAborted(ctx: StrategyContext | undefined): void {
  if (ctx?.signal?.aborted) throw new AbortedError()
}

export interface AutomaticOptions {
  requestedQuality: number
  originalBytes: number
}

/**
 * Modo automático: desce a escada de qualidade até o resultado ficar menor
 * que o original. Nunca redimensiona.
 *
 * Na conversão de formato (o padrão `smart`) isso quase sempre resolve no
 * primeiro degrau — é o caminho comum e é barato.
 */
export async function renderAutomatic(
  render: Renderer,
  options: AutomaticOptions,
  ctx?: StrategyContext,
): Promise<RenderOutcome> {
  const steps = qualitySteps(options.requestedQuality)
  let smallest: Candidate | null = null
  let encodes = 0

  for (const quality of steps) {
    checkAborted(ctx)

    const attempt: RenderAttempt = { quality, scale: 1 }
    const bytes = await render(attempt)
    encodes += 1

    if (!smallest || bytes.byteLength < smallest.bytes.byteLength) {
      smallest = { bytes, attempt }
    }

    if (bytes.byteLength < options.originalBytes) {
      return { bytes, attempt, encodes }
    }

    if (ctx?.isExpired?.()) {
      return { ...smallest, encodes, warning: MESSAGES.timeout }
    }
  }

  if (!smallest) {
    // Inalcançável: QUALITY_LADDER é constante e não-vazia.
    throw new Error('renderAutomatic terminou sem nenhum encode — invariante violada.')
  }

  return { ...smallest, encodes, warning: MESSAGES.automaticFloor }
}

export interface TargetedOptions {
  width: number
  height: number
  originalBytes: number
  targetBytes: number
  /** Teto da busca; vem da qualidade escolhida pelo usuário. */
  maxQuality: number
}

/**
 * Modo meta de tamanho: busca binária na qualidade e, se não bastar, reduz a
 * resolução em degraus de 16% e repete.
 *
 * Duas mudanças em relação ao Electron:
 *
 * 1. **Saída antecipada** quando `low > high`. A sequência de qualidades
 *    aceitas é monotonicamente crescente, logo o último aceito é sempre o de
 *    maior qualidade sob a meta; as iterações após a convergência só
 *    reencodam qualidades já testadas. Produz bytes idênticos — verificado
 *    empiricamente no spike (docs/SPIKE.md §5.4.1) e coberto por teste.
 * 2. **Piso de 900px real** — ver `canScale`.
 */
export async function renderTargeted(
  render: Renderer,
  options: TargetedOptions,
  ctx?: StrategyContext,
): Promise<RenderOutcome> {
  const target = effectiveTargetBytes(options.originalBytes, options.targetBytes)

  let bestUnderTarget: Candidate | null = null
  let smallest: Candidate | null = null
  let scale = 1
  let encodes = 0
  let expired = false

  // O teto é clampado ao piso: sem isto, um `maxQuality` abaixo de 24 faria a
  // saída antecipada disparar já na primeira iteração e a busca terminaria sem
  // nenhum encode. O Electron não tinha o problema porque nunca saía cedo — ele
  // calculava a qualidade fora de faixa e deixava o clamp do encoder corrigir.
  const searchCeiling = Math.max(QUALITY_MIN, Math.min(options.maxQuality, QUALITY_MAX))

  for (let scaleAttempt = 0; scaleAttempt < MAX_SCALE_ATTEMPTS; scaleAttempt += 1) {
    let low = QUALITY_MIN
    let high = searchCeiling

    for (let attempt = 0; attempt < TARGET_SEARCH_ITERATIONS; attempt += 1) {
      if (low > high) break // saída antecipada — resultado idêntico, menos encodes
      checkAborted(ctx)

      const quality = Math.floor((low + high) / 2)
      const candidate: RenderAttempt = { quality, scale }
      const bytes = await render(candidate)
      encodes += 1

      if (!smallest || bytes.byteLength < smallest.bytes.byteLength) {
        smallest = { bytes, attempt: candidate }
      }

      if (bytes.byteLength <= target) {
        bestUnderTarget = { bytes, attempt: candidate }
        low = quality + 1
      } else {
        high = quality - 1
      }

      if (ctx?.isExpired?.()) {
        expired = true
        break
      }
    }

    if (bestUnderTarget) {
      return { ...bestUnderTarget, encodes }
    }

    if (expired) break

    const nextScale = scale * SCALE_STEP
    if (!canScale(options.width, options.height, nextScale)) break
    scale = nextScale
  }

  if (!smallest) {
    // Inalcançável: `searchCeiling >= QUALITY_MIN` garante ao menos um encode.
    // Explícito em vez de asserção — se a invariante quebrar, o erro é claro.
    throw new Error('renderTargeted terminou sem nenhum encode — invariante violada.')
  }

  return {
    ...smallest,
    encodes,
    warning: expired ? MESSAGES.timeout : MESSAGES.targetFloor,
  }
}

/** Converte megabytes da UI para bytes, como no app Electron. */
export function mbToBytes(value: number): number {
  return Math.round(value * 1024 * 1024)
}
