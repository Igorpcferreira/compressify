/**
 * As quatro variantes de botão do brand board, com os estados que ele desenha.
 *
 * O primário usa `--color-on-signal` (#023B2C) em vez do Signal Deep do board:
 * o original dá 3,76:1 sobre Signal e reprova no WCAG AA. A emenda mantém o
 * texto verde — a leitura de marca — e sobe para 6,44:1
 * (docs/brand/DESVIOS.md).
 */

'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
export type ButtonSize = 'md' | 'sm'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-signal text-on-signal font-semibold hover:bg-signal-deep hover:text-white disabled:bg-line disabled:text-text-muted dark:disabled:bg-graphite',
  secondary:
    'border border-border text-text font-medium hover:border-text hover:bg-surface disabled:border-border disabled:text-border',
  ghost: 'text-text-muted font-medium hover:bg-surface hover:text-text disabled:text-border',
  destructive:
    'border border-error text-error-text dark:text-error font-medium hover:bg-error hover:text-white disabled:border-border disabled:text-border',
}

const SIZES: Record<ButtonSize, string> = {
  md: 'h-control px-5 text-[0.9375rem] rounded-button',
  sm: 'h-control-sm px-3.5 text-small rounded-[8px]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors',
        'disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
