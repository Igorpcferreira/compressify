/**
 * Os padrões e as faixas das preferências de compressão.
 *
 * Módulo folha de propósito: ele importa só o tipo `JobOptions`, e por isso
 * pode ser lido pela store, pelos perfis, pela persistência e pela UI sem que
 * nenhum deles precise importar os outros. Quando isto morava dentro de
 * `store/queue.ts`, `lib/preferences.ts` não tinha como validar um valor sem
 * puxar a store inteira — e a store puxa o orquestrador, que puxa o pool.
 *
 * Os números são os do app Electron. Fidelidade é requisito (docs/PLANO.md §6).
 */

import type { JobOptions } from '@/engine/core/types'

/** Os mesmos padrões do app Electron — fidelidade é requisito, não detalhe. */
export const DEFAULT_OPTIONS: JobOptions = {
  mode: 'auto',
  preset: 5,
  outputFormat: 'smart',
  quality: 82,
}

/** Faixa aceita pelo campo de meta personalizada, como no app desktop. */
export const CUSTOM_TARGET_RANGE = { min: 0.1, max: 500 } as const

/** Faixa do controle de qualidade na UI. O motor clampa em 24–95. */
export const QUALITY_RANGE = { min: 35, max: 95 } as const
