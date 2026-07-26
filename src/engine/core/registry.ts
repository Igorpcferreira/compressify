/**
 * Registro de motores.
 *
 * A fila e o orquestrador nunca mencionam `ImageEngine`: eles perguntam ao
 * registro quem sabe processar um arquivo. É o que faz a Fase 2 (PDF) entrar
 * registrando um `PdfEngine` sem tocar em nada do que já existe
 * (docs/PLANO.md §1.2).
 *
 * Este módulo é a raiz de composição do motor — o único ponto de `core` que
 * conhece uma implementação concreta, e só dentro da fábrica padrão.
 */

import { ImageEngine } from '@/engine/image/engine'
import { imageRejectionReason } from '@/engine/image/support'
import type { CompressionEngine } from './types'

export interface EngineRegistry {
  register(engine: CompressionEngine): void
  /** O primeiro motor que aceita o arquivo, ou `null`. */
  resolve(file: File): CompressionEngine | null
  readonly engines: readonly CompressionEngine[]
}

export function createRegistry(initial: readonly CompressionEngine[] = []): EngineRegistry {
  const engines: CompressionEngine[] = [...initial]

  return {
    register(engine) {
      // Re-registrar o mesmo `id` substitui, em vez de acumular duplicatas —
      // um recarregamento de worker não deve dobrar a lista.
      const existing = engines.findIndex((candidate) => candidate.id === engine.id)
      if (existing === -1) {
        engines.push(engine)
      } else {
        engines[existing] = engine
      }
    },

    resolve(file) {
      return engines.find((engine) => engine.supports(file)) ?? null
    },

    get engines() {
      return engines
    },
  }
}

export function createDefaultRegistry(): EngineRegistry {
  return createRegistry([new ImageEngine()])
}

/**
 * Por que este arquivo não é aceito.
 *
 * A mensagem em si mora em `image/support.ts`, que é puro e não arrasta o
 * motor: a thread principal precisa dela no instante do drop e não deve pagar
 * 13 KB de estratégia e decode por isso. Aqui fica só o encaminhamento, porque
 * é deste módulo que o worker já importa.
 */
export function unsupportedReason(file: File): string {
  return imageRejectionReason(file)
}
