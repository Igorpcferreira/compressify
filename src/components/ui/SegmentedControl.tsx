/**
 * O controle segmentado do board — usado no modo (Auto · Meta) e nas metas de
 * tamanho.
 *
 * Acessibilidade: é um grupo de rádio, não uma barra de abas. Abas trocam o
 * painel visível; isto escolhe um valor de formulário. `role="radiogroup"` com
 * setas do teclado é o padrão certo, e é o que o brief §7 cobra.
 */

'use client'

import { useId, useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: string
  /** Rótulo lido por leitor de tela quando o visual é abreviado. */
  description?: string
}

export interface SegmentedControlProps<T extends string | number> {
  label: string
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onChange(value: T): void
  /** Números e unidades vão em JetBrains Mono, como no board. */
  mono?: boolean
  disabled?: boolean
}

export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
  mono = false,
  disabled = false,
}: SegmentedControlProps<T>) {
  const groupId = useId()
  const container = useRef<HTMLDivElement>(null)

  function move(offset: number): void {
    const index = options.findIndex((option) => option.value === value)
    if (index === -1) return

    const next = options[(index + offset + options.length) % options.length]
    if (!next) return

    onChange(next.value)
    // O foco acompanha a seleção: num radiogroup só o item marcado é tabulável,
    // então sem isto a próxima tecla não teria onde cair.
    const buttons = container.current?.querySelectorAll('button')
    buttons?.[(index + offset + options.length) % options.length]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    }
  }

  return (
    <div
      ref={container}
      role="radiogroup"
      aria-label={label}
      id={groupId}
      onKeyDown={onKeyDown}
      className={cn(
        'border-border bg-surface inline-flex overflow-hidden rounded-button border',
        disabled && 'opacity-50',
      )}
    >
      {options.map((option) => {
        const selected = option.value === value

        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.description ?? option.label}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'border-border h-control px-4 text-small transition-colors not-last:border-r',
              mono && 'font-mono',
              selected
                ? 'bg-surface-raised text-signal-deep dark:text-signal font-bold shadow-[inset_0_-2px_0_var(--color-signal)]'
                : 'text-text-muted hover:text-text',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
