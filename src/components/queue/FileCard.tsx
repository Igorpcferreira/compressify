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

import {
  CircleCheckBig,
  CircleX,
  Columns2,
  Download,
  Image as ImageIcon,
  TriangleAlert,
  X,
} from 'lucide-react'
import { memo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { formatBytes, formatDuration, formatPercent, formatSavedPercent } from '@/lib/format'
import { selectItem, selectMode, useQueueStore, type QueueItem } from '@/store/queue'
import { CompareDialog } from './CompareDialog'

const STATUS_LABEL: Record<QueueItem['status'], string> = {
  queued: 'Na fila',
  running: 'Processando',
  success: 'Concluído',
  warning: 'Concluído com aviso',
  error: 'Falhou',
  cancelled: 'Cancelado',
}

function statusLine(item: QueueItem, verb: string): string {
  if (item.status === 'running') return `${verb} · ${formatPercent(item.percent)}`
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
  /**
   * Um card que está convertendo não está "comprimindo". O seletor devolve uma
   * string, não um objeto, e o modo só muda com a fila parada (os controles
   * ficam travados durante o lote) — nenhum evento de progresso passa por aqui.
   */
  const mode = useQueueStore(selectMode)
  const cancelItem = useQueueStore((state) => state.cancelItem)
  const removeItem = useQueueStore((state) => state.removeItem)
  const downloadItem = useQueueStore((state) => state.downloadItem)
  /**
   * A modal aberta é estado **do card**, não da store: ela é local, some com o
   * card e não interessa a mais ninguém. Guardá-la na store faria um evento de
   * progresso de outro arquivo passar por aqui.
   */
  const [comparing, setComparing] = useState(false)

  if (!item) return null

  const running = item.status === 'running' || item.status === 'queued'
  const finished = item.status === 'success' || item.status === 'warning'
  /**
   * A cor segue o **número que está na tela**, e por isso usa o mesmo
   * arredondamento do `formatSavedPercent`: um "+180%" pintado de verde é a
   * interface mentindo com CSS, e um "0%" âmbar seria a mesma mentira ao
   * contrário. Converter para um formato mais fiel produz arquivo maior — isso
   * é correto, e o âmbar diz "repare nisto", não "deu errado".
   */
  const grew = Math.round(item.savedPercent ?? 0) < 0

  return (
    <li
      className={cn(
        'rounded-file flex flex-col gap-4 border px-5 py-4 lg:flex-row lg:items-center lg:gap-5',
        item.status === 'error' ? 'border-error bg-error/4' : 'border-border bg-surface-raised',
      )}
    >
      {/*
        Estreito, o card é **duas linhas**: identificação em cima, números e
        ações embaixo. A linha única não cabe num celular — o nome do arquivo
        era truncado até não sobrar caractere nenhum e os botões saíam pela
        borda direita.

        A partir do `lg` o agrupador vira `display: contents` e desaparece: a
        miniatura e a coluna do nome voltam a ser filhas diretas da linha,
        exatamente como sempre foram. É por isso que a versão larga não tem
        marcação própria — não existem dois cards para manter em sincronia.

        O corte é em 1024 px, e não antes: medindo, em 768 px a coluna do nome
        ainda era espremida a zero pelos números e pelos três botões, que
        sozinhos ocupam ~600 px.
      */}
      <div className="flex min-w-0 items-center gap-4 lg:contents">
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
              {statusLine(item, mode === 'convert' ? 'Convertendo' : 'Comprimindo')}
            </span>
          </div>

          <ProgressBar item={item} />
        </div>
      </div>

      <div className="text-data flex flex-wrap items-center gap-x-3.5 gap-y-3 font-mono lg:flex-none lg:flex-nowrap">
        <span className={cn('text-text-muted', finished && 'line-through')}>
          {formatBytes(item.originalBytes)}
        </span>
        <span className="text-text-muted" aria-hidden>
          →
        </span>

        {finished && item.compressedBytes !== null ? (
          <>
            <span className="font-bold">{formatBytes(item.compressedBytes)}</span>
            <span
              className={cn(
                'h-badge rounded-badge text-small inline-flex items-center px-2.5 font-bold',
                grew ? 'bg-warning text-ink' : 'bg-signal text-on-signal',
              )}
            >
              {formatSavedPercent(item.savedPercent ?? 0)}
            </span>
          </>
        ) : item.status === 'error' ? (
          <span className="text-error-text dark:text-error font-bold">falhou</span>
        ) : (
          <span className="text-text-muted">—</span>
        )}

        {finished && item.blob ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setComparing(true)}
            aria-label={`Comparar ${item.name} antes e depois`}
          >
            <Columns2 size={15} aria-hidden />
            Comparar
          </Button>
        ) : null}

        {finished && item.blob ? (
          <Button
            size="sm"
            onClick={() => downloadItem(id)}
            aria-label={`Baixar ${item.outputName ?? item.name}`}
            title={item.outputName ?? undefined}
          >
            <Download size={15} aria-hidden />
            Baixar
          </Button>
        ) : null}

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

      {/*
        Montada só enquanto aberta: as duas object URLs da comparação nascem
        com ela e morrem com ela. Cinquenta cards com a modal sempre montada
        seriam cem URLs segurando o lote inteiro na memória.
      */}
      {comparing ? <CompareDialog item={item} onClose={() => setComparing(false)} /> : null}
    </li>
  )
})
