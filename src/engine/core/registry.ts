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
import { DROPPED_INPUT_EXTENSIONS, isDroppedInput } from '@/engine/image/format'
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
 * Por que este arquivo não é aceito — para a UI dizer algo útil em vez de
 * ignorar em silêncio.
 *
 * O TIFF tem mensagem própria: ele era aceito pelo app Electron e sai aqui
 * porque não existe decoder no jSquash e nenhum navegador além do Safari
 * decodifica (docs/PLANO.md §3.5). Quem arrasta um `.tif` merece saber disso,
 * não um "formato não suportado" genérico.
 */
export function unsupportedReason(file: File): string {
  if (isDroppedInput(file.name)) {
    const extensions = DROPPED_INPUT_EXTENSIONS.join(' e ')
    return `Arquivos ${extensions} não são suportados: os navegadores não decodificam TIFF. Converta para PNG ou JPEG antes.`
  }

  return `Formato não suportado: ${file.name}`
}
