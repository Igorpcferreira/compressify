/**
 * O que foi recusado na entrada, e por quê.
 *
 * Existe por uma razão específica: o TIFF era aceito pelo app Electron e não é
 * aqui, porque nenhum navegador além do Safari decodifica e não há decoder no
 * jSquash (docs/PLANO.md §3.5). Quem arrasta 50 arquivos e vê 48 cards merece
 * saber quais dois sumiram. A mensagem vem pronta do
 * `registry.unsupportedReason()`.
 */

'use client'

import { TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { selectRejected, useQueueStore } from '@/store/queue'

export function RejectedNotice() {
  const rejected = useQueueStore(selectRejected)
  const dismiss = useQueueStore((state) => state.dismissRejected)

  if (rejected.length === 0) return null

  return (
    <div
      role="alert"
      className="border-warning bg-warning/8 rounded-block flex items-start gap-3.5 border p-4"
    >
      <TriangleAlert size={18} className="text-warning mt-0.5 flex-none" aria-hidden />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-small font-medium">
          {rejected.length === 1
            ? '1 arquivo não entrou na fila'
            : `${rejected.length} arquivos não entraram na fila`}
        </p>
        <ul className="text-small text-text-muted flex flex-col gap-1">
          {rejected.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <span className="text-data font-mono">{item.name}</span> — {item.reason}
            </li>
          ))}
        </ul>
      </div>

      <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Dispensar aviso">
        <X size={15} aria-hidden />
      </Button>
    </div>
  )
}
