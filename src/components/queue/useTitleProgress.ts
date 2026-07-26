/**
 * O progresso do lote no título da aba.
 *
 * Um lote de 50 fotos é tempo de trocar de aba, e uma aba que não diz nada
 * obriga a pessoa a voltar para conferir. O título é o único lugar que continua
 * visível quando o Compressify não está na frente.
 *
 * ### Por que uma contagem, e não uma porcentagem
 *
 * Uma porcentagem real exigiria a média do progresso de **todos** os itens — ou
 * seja, assinar `items` inteiro. Isso é exatamente o que a store foi desenhada
 * para evitar (docs/PLANO.md §1.4): um evento de progresso trocaria a
 * referência de um item, o seletor derivaria um número novo e a árvore inteira
 * repintaria dezenas de vezes por segundo. Pagar isso para animar um texto que
 * está fora da tela seria trocar a razão de a store existir por um enfeite.
 *
 * `stats` já é estado, já é recalculado só quando um job entra, sai ou termina,
 * e "12 de 50" responde à pergunta melhor que "37%".
 *
 * O título original é lido do documento, e não fixado aqui, porque cada landing
 * tem o seu — e restaurá-lo é obrigação: a aba não pode ficar marcada com um
 * lote que já acabou.
 */

'use client'

import { useEffect, useRef } from 'react'
import { selectPhase, selectStats, useQueueStore } from '@/store/queue'

export function useTitleProgress(): void {
  const phase = useQueueStore(selectPhase)
  const stats = useQueueStore(selectStats)
  const original = useRef<string | null>(null)

  useEffect(() => {
    if (phase !== 'running') {
      if (original.current !== null) {
        document.title = original.current
        original.current = null
      }
      return
    }

    // `??=` e não `=`: o efeito roda de novo a cada mudança de `stats`, e nesse
    // momento `document.title` já é o título com o contador. Reler ali
    // empilharia "(2/50) (1/50) Compressify".
    original.current ??= document.title

    const concluidos = stats.done + stats.failed + stats.cancelled
    document.title = `(${concluidos}/${stats.total}) ${original.current}`
  }, [phase, stats])

  // Desmontar no meio de um lote deixaria o título travado no contador.
  useEffect(
    () => () => {
      if (original.current !== null) {
        document.title = original.current
        original.current = null
      }
    },
    [],
  )
}
