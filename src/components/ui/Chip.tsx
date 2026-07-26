/**
 * Os chips de formato do board: pílula em JetBrains Mono, o selecionado em
 * Ink sólido.
 *
 * Também é um radiogroup — escolher o formato de saída é escolher um valor,
 * não navegar. O `ChipGroup` cuida do teclado; o `Chip` só desenha.
 */

'use client'

import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

export interface ChipOption<T extends string> {
  value: T
  label: string
  description?: string
}

export interface ChipGroupProps<T extends string> {
  label: string
  value: T
  options: ReadonlyArray<ChipOption<T>>
  onChange(value: T): void
  disabled?: boolean
}

export function ChipGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: ChipGroupProps<T>) {
  const container = useRef<HTMLDivElement>(null)

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    if (!forward && !backward) return

    event.preventDefault()
    const index = options.findIndex((option) => option.value === value)
    if (index === -1) return

    const target = (index + (forward ? 1 : -1) + options.length) % options.length
    const next = options[target]
    if (!next) return

    onChange(next.value)
    container.current?.querySelectorAll('button')[target]?.focus()
  }

  return (
    <div
      ref={container}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex flex-wrap gap-2.5"
    >
      {options.map((option) => {
        const selected = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.description ?? option.label}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-control-sm text-small rounded-pill px-4 font-mono transition-colors',
              'disabled:pointer-events-none disabled:opacity-50',
              selected
                ? 'bg-ink dark:bg-white dark:text-ink font-medium text-white'
                : 'border-border text-text-muted hover:text-text border',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
