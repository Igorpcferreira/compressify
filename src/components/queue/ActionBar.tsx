/**
 * A barra de ação: o resumo da fila à esquerda, os botões à direita.
 *
 * O botão primário troca de papel conforme a fase — "Comprimir tudo" vira
 * "Cancelar" enquanto roda. Dois botões lado a lado, um sempre desabilitado,
 * seria ruído; e cancelar precisa estar no lugar em que a mão já está.
 *
 * "Salvar em pasta" só existe onde a File System Access API existe. Sem ela, o
 * botão **não aparece** — nada de item desabilitado com "seu navegador não
 * suporta". É a regra do `PLANO.md` §4.2: degradar sem alarde.
 */

'use client'

import { Download, FolderDown, Square, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatBytes, formatPercent, formatSavedPercent, savedPercentOf } from '@/lib/format'
import {
  selectCanSaveToFolder,
  selectOutput,
  selectPhase,
  selectStats,
  useQueueStore,
} from '@/store/queue'

function OutputStatus() {
  const output = useQueueStore(selectOutput)
  const cancelOutput = useQueueStore((state) => state.cancelOutput)
  const dismissOutput = useQueueStore((state) => state.dismissOutput)

  if (output.phase !== 'idle') {
    return (
      <span className="text-small text-text-muted flex items-center gap-3">
        <span aria-live="polite">
          {output.phase === 'zipping' ? 'Compactando' : 'Salvando'} ·{' '}
          <span className="text-data font-mono">{formatPercent(output.percent)}</span>
        </span>
        <Button size="sm" variant="ghost" onClick={cancelOutput}>
          <X size={15} aria-hidden />
          Cancelar
        </Button>
      </span>
    )
  }

  if (output.error) {
    return (
      <span
        role="alert"
        className="text-small text-error-text dark:text-error flex items-center gap-2"
      >
        {output.error}
        <Button size="sm" variant="ghost" onClick={dismissOutput} aria-label="Dispensar erro">
          <X size={15} aria-hidden />
        </Button>
      </span>
    )
  }

  if (output.notice) {
    return (
      <span className="text-small text-text-muted" aria-live="polite">
        {output.notice}
      </span>
    )
  }

  return null
}

export function ActionBar() {
  const stats = useQueueStore(selectStats)
  const phase = useQueueStore(selectPhase)
  const output = useQueueStore(selectOutput)
  const canSaveToFolder = useQueueStore(selectCanSaveToFolder)
  const start = useQueueStore((state) => state.start)
  const cancelAll = useQueueStore((state) => state.cancelAll)
  const clearQueue = useQueueStore((state) => state.clearQueue)
  const downloadAll = useQueueStore((state) => state.downloadAll)
  const saveToFolder = useQueueStore((state) => state.saveToFolder)

  if (stats.total === 0) return null

  const running = phase === 'running'
  const busy = output.phase !== 'idle'
  const savedBytes = stats.originalBytes - stats.compressedBytes

  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="flex flex-wrap items-center justify-between gap-4">
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
          <Button variant="ghost" onClick={clearQueue} disabled={running || busy}>
            <Trash2 size={15} aria-hidden />
            Limpar fila
          </Button>

          {stats.done > 0 && !running ? (
            <>
              {canSaveToFolder ? (
                <Button onClick={() => void saveToFolder()} disabled={busy}>
                  <FolderDown size={15} aria-hidden />
                  Salvar em pasta
                </Button>
              ) : null}

              <Button onClick={() => void downloadAll()} disabled={busy}>
                <Download size={15} aria-hidden />
                {stats.done === 1 ? 'Baixar' : 'Baixar tudo (.zip)'}
              </Button>
            </>
          ) : null}

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

      <OutputStatus />
    </div>
  )
}
