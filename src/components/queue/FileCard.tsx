/**
 * O card de arquivo — o componente-assinatura do design system.
 *
 * A regra de re-render mora aqui: o card assina **um** item por `id`. Um evento
 * de progresso troca a referência daquele item e de mais nenhum, então os
 * outros 49 cards não repintam (docs/PLANO.md §1.4). Qualquer seletor que
 * derive objeto novo — `items` inteiro, um `.map`, um `{...}` — anula isso.
 *
 * A barra de progresso é `role="progressbar"` de verdade, com `aria-valuenow`:
 * quem usa leitor de tela precisa saber que 62% é 62%, não que existe uma div
 * verde.
 */

'use client'

import { CircleCheckBig, CircleX, Image as ImageIcon, TriangleAlert, X } from 'lucide-react'
import { memo } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { formatBytes, formatDuration, formatPercent, formatSavedPercent } from '@/lib/format'
import { selectItem, useQueueStore, type QueueItem } from '@/store/queue'

const STATUS_LABEL: Record<QueueItem['status'], string> = {
  queued: 'Na fila',
  running: 'Comprimindo',
  success: 'Concluído',
  warning: 'Concluído com aviso',
  error: 'Falhou',
  cancelled: 'Cancelado',
}

function statusLine(item: QueueItem): string {
  if (item.status === 'running') return `Comprimindo · ${formatPercent(item.percent)}`
  if (item.status === 'queued') return 'Na fila'
  if (item.status === 'cancelled') return 'Cancelado'
  if (item.status === 'error') return item.message ?? 'Falhou'
  if (item.status === 'warning') return item.message ?? 'Concluído com aviso'
  return item.durationMs === null ? 'Concluído' : `Concluído em ${formatDuration(item.durationMs)}`
}

function Thumb({ status }: { status: QueueItem['status'] }) {
  const failed = status === 'error'

  return (
    <span
      className={cn(
        'rounded-thumb flex size-12 flex-none items-center justify-center border',
        failed
          ? 'border-error bg-surface-raised text-error'
          : 'border-border bg-surface text-text-muted',
      )}
    >
      {failed ? (
        <CircleX size={24} strokeWidth={1.5} aria-hidden />
      ) : status === 'warning' ? (
        <TriangleAlert size={24} strokeWidth={1.5} aria-hidden />
      ) : status === 'success' ? (
        <CircleCheckBig size={24} strokeWidth={1.5} aria-hidden />
      ) : (
        <ImageIcon size={24} strokeWidth={1.5} aria-hidden />
      )}
    </span>
  )
}

function ProgressBar({ item }: { item: QueueItem }) {
  const done = item.status === 'success' || item.status === 'warning'
  const width = done ? 100 : item.status === 'error' ? 100 : item.percent

  return (
    <div
      role="progressbar"
      aria-label={`Progresso de ${item.name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      className="bg-border h-[3px] overflow-hidden rounded-[2px]"
    >
      <div
        className={cn(
          'h-full transition-[width] duration-200',
          item.status === 'error'
            ? 'bg-error'
            : item.status === 'cancelled'
              ? 'bg-slate'
              : 'bg-signal',
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

export const FileCard = memo(function FileCard({ id }: { id: string }) {
  const item = useQueueStore(selectItem(id))
  const cancelItem = useQueueStore((state) => state.cancelItem)
  const removeItem = useQueueStore((state) => state.removeItem)

  if (!item) return null

  const running = item.status === 'running' || item.status === 'queued'
  const finished = item.status === 'success' || item.status === 'warning'

  return (
    <li
      className={cn(
        'rounded-file flex items-center gap-5 border px-5 py-4',
        item.status === 'error' ? 'border-error bg-error/4' : 'border-border bg-surface-raised',
      )}
    >
      <Thumb status={item.status} />

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-data truncate font-mono font-medium" title={item.path}>
            {item.name}
          </span>
          <span
            className={cn(
              'text-small',
              item.status === 'error' ? 'text-error-text dark:text-error' : 'text-text-muted',
            )}
          >
            {statusLine(item)}
          </span>
        </div>

        <ProgressBar item={item} />
      </div>

      <div className="text-data flex flex-none items-center gap-3.5 font-mono">
        <span className={cn('text-text-muted', finished && 'line-through')}>
          {formatBytes(item.originalBytes)}
        </span>
        <span className="text-text-muted" aria-hidden>
          →
        </span>

        {finished && item.compressedBytes !== null ? (
          <>
            <span className="font-bold">{formatBytes(item.compressedBytes)}</span>
            <span className="bg-signal text-on-signal h-badge rounded-badge text-small inline-flex items-center px-2.5 font-bold">
              {formatSavedPercent(item.savedPercent ?? 0)}
            </span>
          </>
        ) : item.status === 'error' ? (
          <span className="text-error-text dark:text-error font-bold">falhou</span>
        ) : (
          <span className="text-text-muted">—</span>
        )}

        {running ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => cancelItem(id)}
            aria-label={`Cancelar ${item.name}`}
          >
            <X size={15} aria-hidden />
            Cancelar
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => removeItem(id)}
            aria-label={`Remover ${item.name} da fila`}
            title={`${STATUS_LABEL[item.status]} — remover da fila`}
          >
            <X size={15} aria-hidden />
            Remover
          </Button>
        )}
      </div>
    </li>
  )
})
