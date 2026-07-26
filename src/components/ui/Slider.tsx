/**
 * O controle de qualidade.
 *
 * É um `<input type="range">` de verdade, estilizado — não uma reconstrução com
 * divs e ponteiro. Range nativo já traz teclado (setas, Home/End, PageUp/Down),
 * anúncio de valor por leitor de tela e suporte a toque. Refazer isso à mão é
 * como se perde acessibilidade sem perceber.
 *
 * O preenchimento em Signal vem de um gradiente calculado, porque
 * `::-webkit-slider-runnable-track` não enxerga a posição do valor.
 */

'use client'

import { useId } from 'react'

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  /** Extremos do board: "menor arquivo" à esquerda, "sem perda" à direita. */
  minLabel?: string
  maxLabel?: string
  onChange(value: number): void
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  minLabel,
  maxLabel,
  onChange,
}: SliderProps) {
  const id = useId()
  const filled = ((value - min) / (max - min)) * 100

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-eyebrow text-text-muted uppercase">
          {label}
        </label>
        <output htmlFor={id} className="text-data font-mono font-bold">
          {value}%
        </output>
      </div>

      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          background: `linear-gradient(to right, var(--color-signal) ${filled}%, var(--color-border) ${filled}%)`,
        }}
        className="h-1 w-full cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[1.5px] [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-[var(--color-text)] [&::-moz-range-thumb]:bg-[var(--color-surface-raised)] [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[1.5px] [&::-webkit-slider-thumb]:border-[var(--color-text)] [&::-webkit-slider-thumb]:bg-[var(--color-surface-raised)]"
      />

      {(minLabel ?? maxLabel) ? (
        <div className="text-caption text-text-muted flex justify-between font-mono">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      ) : null}
    </div>
  )
}
