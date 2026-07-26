/**
 * A lista.
 *
 * Ela assina **só o array de ids**. Nenhum progresso passa por aqui: o item
 * inteiro é lido dentro do `FileCard`, que é `memo`. Sem essa divisão, um
 * evento de 1% re-renderizaria a lista com 50 filhos.
 *
 * `aria-live="polite"` no resumo — e não em cada card — dá a quem usa leitor de
 * tela o andamento sem narrar 100 mudanças de porcentagem por arquivo.
 */

'use client'

import { FileCard } from './FileCard'
import { selectOrder, selectStats, useQueueStore } from '@/store/queue'

export function QueueList() {
  const order = useQueueStore(selectOrder)
  const stats = useQueueStore(selectStats)

  if (order.length === 0) return null

  return (
    <section aria-label="Fila de arquivos" className="flex flex-col gap-3">
      <p className="sr-only" aria-live="polite">
        {stats.done} de {stats.total} arquivos concluídos.
      </p>

      <ul className="flex flex-col gap-2.5">
        {order.map((id) => (
          <FileCard key={id} id={id} />
        ))}
      </ul>
    </section>
  )
}
