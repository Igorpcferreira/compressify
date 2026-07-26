/**
 * A store da fila — o que a UI lê e o que a UI dispara.
 *
 * Zustand foi escolhido por um argumento de re-render, não por preferência
 * (docs/PLANO.md §1.4): com oito workers reportando progresso, são dezenas de
 * eventos por segundo. Em Context + reducer, cada evento repinta todos os
 * consumidores — 50 cards repintam porque um foi de 61% para 62%.
 *
 * Duas regras sustentam essa promessa aqui dentro, e quebrar qualquer uma delas
 * anula o motivo de a store existir:
 *
 * 1. **Um evento de progresso troca a referência de um item só.** O `items` é um
 *    mapa por `id`; os outros itens continuam sendo o mesmo objeto, então o
 *    `FileCard` que assina `state.items[id]` não re-renderiza.
 * 2. **Nada de derivar objeto novo em seletor.** `stats` é estado, recalculado
 *    só quando um job entra, sai ou termina — nunca a cada 1% de progresso.
 *
 * O orquestrador vive fora da store e nasce na primeira interação: ele cria
 * workers, e workers não existem durante a pré-renderização estática.
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand'
import {
  QueueOrchestrator,
  type JobOutcome,
  type OrchestratorEvents,
  type RunSummary,
} from '@/engine/core/orchestrator'
import type { JobOptions, JobStatus } from '@/engine/core/types'
import { acceptImage } from '@/engine/image/support'
import { createImagePool } from '@/engine/workers/spawn'
import { fileNameOf } from '@/engine/image/naming'
import { savedPercentOf } from '@/lib/format'

export interface QueueItem {
  id: string
  /** Caminho relativo, quando veio de uma pasta. */
  path: string
  /** Só o nome, para exibir. */
  name: string
  status: JobStatus
  percent: number
  originalBytes: number
  compressedBytes: number | null
  savedPercent: number | null
  outputName: string | null
  /** O resultado, guardado para o download do Incremento 6. */
  blob: Blob | null
  message: string | null
  width: number | null
  height: number | null
  durationMs: number | null
}

export interface RejectedItem {
  name: string
  reason: string
}

export interface QueueStats {
  total: number
  queued: number
  done: number
  failed: number
  cancelled: number
  originalBytes: number
  compressedBytes: number
}

export type QueuePhase = 'idle' | 'running'

export interface QueueState {
  items: Record<string, QueueItem>
  order: string[]
  rejected: RejectedItem[]
  options: JobOptions
  phase: QueuePhase
  stats: QueueStats
  lastSummary: RunSummary | null

  addFiles(files: readonly File[]): void
  removeItem(id: string): void
  clearQueue(): void
  dismissRejected(): void
  setOptions(patch: Partial<JobOptions>): void
  start(): Promise<void>
  cancelItem(id: string): void
  cancelAll(): void
}

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

const EMPTY_STATS: QueueStats = {
  total: 0,
  queued: 0,
  done: 0,
  failed: 0,
  cancelled: 0,
  originalBytes: 0,
  compressedBytes: 0,
}

const FINAL_STATUSES = new Set<JobStatus>(['success', 'warning', 'error', 'cancelled'])

function tally(items: Record<string, QueueItem>, order: readonly string[]): QueueStats {
  const stats: QueueStats = { ...EMPTY_STATS, total: order.length }

  for (const id of order) {
    const item = items[id]
    if (!item) continue

    switch (item.status) {
      case 'success':
      case 'warning':
        stats.done += 1
        stats.originalBytes += item.originalBytes
        stats.compressedBytes += item.compressedBytes ?? item.originalBytes
        break
      case 'error':
        stats.failed += 1
        break
      case 'cancelled':
        stats.cancelled += 1
        break
      case 'queued':
      case 'running':
        stats.queued += 1
        break
    }
  }

  return stats
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export interface QueueStoreOptions {
  /** Ponto de injeção dos testes: evita criar workers de verdade. */
  createOrchestrator?(events: OrchestratorEvents): QueueOrchestrator
}

export type QueueStore = UseBoundStore<StoreApi<QueueState>>

export function createQueueStore(options: QueueStoreOptions = {}): QueueStore {
  const build =
    options.createOrchestrator ??
    ((events: OrchestratorEvents) =>
      new QueueOrchestrator({ pool: createImagePool(), accept: acceptImage, events }))

  return create<QueueState>((set, get) => {
    let orchestrator: QueueOrchestrator | null = null
    /** Início de cada job, fora do estado: cronômetro não deve repintar nada. */
    const startedAt = new Map<string, number>()

    /** Troca um item preservando a referência de todos os outros. */
    function patchItem(id: string, patch: Partial<QueueItem>, retally = false): void {
      set((state) => {
        const current = state.items[id]
        if (!current) return state

        const items = { ...state.items, [id]: { ...current, ...patch } }
        return retally ? { items, stats: tally(items, state.order) } : { items }
      })
    }

    function settle(id: string, outcome: JobOutcome): void {
      const started = startedAt.get(id)
      startedAt.delete(id)
      const durationMs = started === undefined ? null : Math.round(now() - started)

      if (outcome.status === 'error') {
        patchItem(id, { status: 'error', message: outcome.message, durationMs }, true)
        return
      }

      if (outcome.status === 'cancelled') {
        patchItem(id, { status: 'cancelled', message: null, durationMs }, true)
        return
      }

      const { result } = outcome
      patchItem(
        id,
        {
          status: outcome.status,
          percent: 100,
          compressedBytes: result.compressedBytes,
          savedPercent: savedPercentOf(result.originalBytes, result.compressedBytes),
          outputName: result.outputName,
          blob: result.blob,
          message: result.message ?? null,
          width: result.width,
          height: result.height,
          durationMs,
        },
        true,
      )
    }

    const events: OrchestratorEvents = {
      onAccepted(job) {
        set((state) => {
          const items: Record<string, QueueItem> = {
            ...state.items,
            [job.id]: {
              id: job.id,
              path: job.path,
              name: fileNameOf(job.path),
              status: 'queued',
              percent: 0,
              originalBytes: job.file.size,
              compressedBytes: null,
              savedPercent: null,
              outputName: null,
              blob: null,
              message: null,
              width: null,
              height: null,
              durationMs: null,
            },
          }
          const order = [...state.order, job.id]
          return { items, order, stats: tally(items, order) }
        })
      },

      onRejected(rejected) {
        set((state) => ({
          rejected: [...state.rejected, { name: rejected.file.name, reason: rejected.reason }],
        }))
      },

      onMetadata(id, metadata) {
        patchItem(id, { width: metadata.width, height: metadata.height })
      },

      onStart(id) {
        startedAt.set(id, now())
        patchItem(id, { status: 'running' }, true)
      },

      onProgress(id, percent) {
        // O caminho quente. Nada de `tally` aqui: é o que separa 50 cards
        // repintando de um só.
        patchItem(id, { percent })
      },

      onSettled(id, outcome) {
        settle(id, outcome)
      },
    }

    function ensure(): QueueOrchestrator {
      orchestrator ??= build(events)
      return orchestrator
    }

    return {
      items: {},
      order: [],
      rejected: [],
      options: DEFAULT_OPTIONS,
      phase: 'idle',
      stats: EMPTY_STATS,
      lastSummary: null,

      addFiles(files) {
        if (files.length === 0) return
        ensure().add(files)
      },

      removeItem(id) {
        orchestrator?.remove(id)
        startedAt.delete(id)

        set((state) => {
          if (!state.items[id]) return state

          const items = { ...state.items }
          delete items[id]
          const order = state.order.filter((current) => current !== id)
          return { items, order, stats: tally(items, order) }
        })
      },

      clearQueue() {
        orchestrator?.clear()
        startedAt.clear()
        set({ items: {}, order: [], stats: EMPTY_STATS, lastSummary: null, rejected: [] })
      },

      dismissRejected() {
        set({ rejected: [] })
      },

      setOptions(patch) {
        set((state) => ({ options: { ...state.options, ...patch } }))
      },

      async start() {
        if (get().phase === 'running') return

        const pending = get().order.some((id) => get().items[id]?.status === 'queued')
        if (!pending) return

        set({ phase: 'running', lastSummary: null })
        try {
          const summary = await ensure().run(get().options)
          set({ phase: 'idle', lastSummary: summary })
        } catch {
          // `run` não rejeita — cada job já é resolvido individualmente. O
          // catch existe para que uma falha inesperada não deixe a UI travada
          // em "processando" para sempre.
          set({ phase: 'idle' })
        }
      },

      cancelItem(id) {
        orchestrator?.cancel(id)
        // A fila ainda não rodou: não há job para o orquestrador cancelar.
        if (!FINAL_STATUSES.has(get().items[id]?.status ?? 'queued')) {
          patchItem(id, { status: 'cancelled' }, true)
        }
      },

      cancelAll() {
        orchestrator?.cancelAll()
      },
    }
  })
}

export const useQueueStore = createQueueStore()

/* -------------------------------------------------------------------------
   Seletores estáveis. Cada um devolve valor primitivo ou a mesma referência
   entre renders — é o contrato que mantém o custo de re-render onde deve.
   ------------------------------------------------------------------------- */

export const selectOrder = (state: QueueState): string[] => state.order
export const selectStats = (state: QueueState): QueueStats => state.stats
export const selectPhase = (state: QueueState): QueuePhase => state.phase
export const selectOptions = (state: QueueState): JobOptions => state.options
export const selectRejected = (state: QueueState): RejectedItem[] => state.rejected

export function selectItem(id: string): (state: QueueState) => QueueItem | undefined {
  return (state) => state.items[id]
}
