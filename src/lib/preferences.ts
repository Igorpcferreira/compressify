/**
 * As preferências sobrevivem à aba fechada.
 *
 * Quem comprime para a web comprime para a web sempre; reescolher modo, formato
 * e qualidade a cada visita é atrito puro. São ~120 bytes em `localStorage`,
 * **nada sobre os arquivos** — nem nome, nem tamanho, nem histórico. A promessa
 * de privacidade vale para o armazenamento local também: o que fica guardado é
 * a configuração do painel, e nada que descreva o que a pessoa comprimiu.
 *
 * Duas regras que este módulo existe para cumprir:
 *
 * 1. **Nada é confiado.** `localStorage` é editável pelo usuário, sobrevive a
 *    mudanças de versão do app e pode conter lixo de uma versão anterior. Tudo
 *    que entra passa por validação campo a campo, e qualquer coisa inválida cai
 *    no padrão em vez de contaminar o motor.
 * 2. **Nada explode.** Modo privativo do Safari lança em `setItem`; um
 *    `localStorage` bloqueado por política lança até em leitura. Persistir
 *    preferência não é motivo para quebrar a aplicação, então tudo aqui degrada
 *    para "usa o padrão" em silêncio.
 *
 * O `Storage` entra por parâmetro para que os testes rodem em Node sem
 * navegador, e para que o caminho "não existe armazenamento" seja exercitado.
 */

import type {
  CompressionMode,
  CompressionPreset,
  JobOptions,
  OutputFormat,
} from '@/engine/core/types'
import { CUSTOM_TARGET_RANGE, DEFAULT_OPTIONS, QUALITY_RANGE } from './defaults'

/**
 * A versão faz parte da chave. Se o formato mudar, a chave muda junto e o valor
 * antigo é simplesmente ignorado — migração de preferência não vale o código
 * que custaria.
 */
export const PREFERENCES_KEY = 'compressify:preferencias:1'

const MODES: readonly CompressionMode[] = ['auto', 'target']
const FORMATS: readonly OutputFormat[] = ['smart', 'original', 'jpeg', 'webp', 'avif', 'png']
const PRESETS: readonly CompressionPreset[] = [5, 10, 50, 'custom']

function isOneOf<T>(values: readonly T[], value: unknown): value is T {
  return values.includes(value as T)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Constrói `JobOptions` válido a partir de qualquer coisa.
 *
 * Campo a campo em vez de um spread sobre o padrão: um spread aceitaria
 * `quality: "muito"` e mandaria a string para o motor. Exportado porque o teste
 * de validação é sobre esta função, não sobre `localStorage`.
 */
export function sanitizeOptions(input: unknown): JobOptions {
  if (typeof input !== 'object' || input === null) return DEFAULT_OPTIONS

  const raw = input as Record<string, unknown>
  const options: JobOptions = { ...DEFAULT_OPTIONS }

  if (isOneOf(MODES, raw.mode)) options.mode = raw.mode
  if (isOneOf(FORMATS, raw.outputFormat)) options.outputFormat = raw.outputFormat
  if (isOneOf(PRESETS, raw.preset)) options.preset = raw.preset

  if (typeof raw.quality === 'number' && Number.isFinite(raw.quality)) {
    options.quality = Math.round(clamp(raw.quality, QUALITY_RANGE.min, QUALITY_RANGE.max))
  }

  if (typeof raw.customTargetMb === 'number' && Number.isFinite(raw.customTargetMb)) {
    options.customTargetMb = clamp(
      raw.customTargetMb,
      CUSTOM_TARGET_RANGE.min,
      CUSTOM_TARGET_RANGE.max,
    )
  }

  return options
}

/** O `localStorage` do navegador, ou `null` onde ele não existe ou é proibido. */
export function browserStorage(): Storage | null {
  try {
    // O acesso em si pode lançar `SecurityError` quando cookies de terceiros
    // estão bloqueados — daí o try envolver a leitura da propriedade também.
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadPreferences(storage: Storage | null = browserStorage()): JobOptions {
  if (!storage) return DEFAULT_OPTIONS

  try {
    const raw = storage.getItem(PREFERENCES_KEY)
    if (!raw) return DEFAULT_OPTIONS
    return sanitizeOptions(JSON.parse(raw))
  } catch {
    return DEFAULT_OPTIONS
  }
}

export function savePreferences(
  options: JobOptions,
  storage: Storage | null = browserStorage(),
): void {
  if (!storage) return

  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(options))
  } catch {
    // Cota estourada ou modo privativo. Perder a preferência é aceitável;
    // derrubar a compressão por causa dela não é.
  }
}

export function clearPreferences(storage: Storage | null = browserStorage()): void {
  try {
    storage?.removeItem(PREFERENCES_KEY)
  } catch {
    // idem
  }
}
