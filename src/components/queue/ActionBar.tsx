/**
 * A barra de ação: o resumo da fila à esquerda, os botões à direita.
 *
 * O botão primário troca de papel conforme a fase — "Comprimir tudo" vira
 * "Cancelar" enquanto roda. Dois botões lado a lado, um sempre desabilitado,
 * seria ruído; e cancelar precisa estar no lugar em que a mão já está.
 *
 * "Baixar tudo (.zip)" é do Incremento 6 e ainda não existe aqui.
 */

'use client'

import { Square, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatBytes, formatSavedPercent } from '@/lib/format'
import { savedPercentOf } from '@/lib/format'
import { selectPhase, selectStats, useQueueStore } from '@/store/queue'

export function ActionBar() {
  const stats = useQueueStore(selectStats)
  const phase = useQueueStore(selectPhase)
  const start = useQueueStore((state) => state.start)
  const cancelAll = useQueueStore((state) => state.cancelAll)
  const clearQueue = useQueueStore((state) => state.clearQueue)

  if (stats.total === 0) return null

  const running = phase === 'running'
  const savedBytes = stats.originalBytes - stats.compressedBytes

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-1">
      <p className="text-caption text-text-muted font-mono uppercase">
        {stats.total} {stats.total === 1 ? 'arquivo' : 'arquivos'}
        {stats.done > 0 ? ` · ${stats.done} concluído${stats.done === 1 ? '' : 's'}` : ''}
        {stats.failed > 0 ? ` · ${stats.failed} com falha` : ''}
        {stats.cancelled > 0
          ? ` · ${stats.cancelled} cancelado${stats.cancelled === 1 ? '' : 's'}`
          : ''}
        {stats.done > 0
          ? ` · ${formatBytes(savedBytes)} economizados (${formatSavedPercent(
              savedPercentOf(stats.originalBytes, stats.compressedBytes),
            )})`
          : ''}
      </p>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="ghost" onClick={clearQueue} disabled={running}>
          <Trash2 size={15} aria-hidden />
          Limpar fila
        </Button>

        {running ? (
          <Button variant="destructive" onClick={cancelAll}>
            <Square size={14} aria-hidden />
            Cancelar tudo
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void start()} disabled={stats.queued === 0}>
            <Sparkles size={15} aria-hidden />
            Comprimir tudo
          </Button>
        )}
      </div>
    </div>
  )
}
