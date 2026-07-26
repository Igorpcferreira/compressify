// @vitest-environment jsdom

/**
 * O card, no ponto exato em que ele pode mentir.
 *
 * `formatSavedPercent` já devolve "+180%" quando o arquivo cresce, e isso está
 * testado em `format-numbers.test.ts`. O que não estava preso é a **cor**: o
 * badge era verde sempre, e um "+180%" verde é a interface contradizendo o
 * próprio número. Converter para um formato mais fiel produz arquivo maior com
 * frequência, então isto deixou de ser caso de borda.
 */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileCard } from '@/components/queue/FileCard'
import { DEFAULT_OPTIONS } from '@/lib/defaults'
import { useQueueStore, type QueueItem } from '@/store/queue'
import { imageFile } from '../helpers/images'

const ID = 'item-1'

function seed(patch: Partial<QueueItem>, mode = DEFAULT_OPTIONS.mode): void {
  const item: QueueItem = {
    id: ID,
    path: 'foto.jpg',
    name: 'foto.jpg',
    status: 'success',
    percent: 100,
    originalBytes: 760_000,
    compressedBytes: 760_000,
    savedPercent: 0,
    outputName: 'foto-compressify.png',
    file: imageFile({ name: 'foto.jpg' }),
    blob: new Blob([new Uint8Array(8)]),
    message: null,
    width: 400,
    height: 300,
    durationMs: 120,
    ...patch,
  }

  useQueueStore.setState({
    items: { [ID]: item },
    order: [ID],
    options: { ...DEFAULT_OPTIONS, mode },
  })
}

function badge(): HTMLElement {
  const found = screen.getByText(/^[−+]?\d+%$/)
  return found
}

beforeEach(() => {
  useQueueStore.setState({ items: {}, order: [], options: DEFAULT_OPTIONS })
})

afterEach(cleanup)

describe('FileCard — o badge de economia', () => {
  it('é verde quando o arquivo encolheu', () => {
    seed({ compressedBytes: 200_000, savedPercent: 73.7 })
    render(<FileCard id={ID} />)

    expect(badge().textContent).toBe('−74%')
    expect(badge().className).toContain('bg-signal')
    expect(badge().className).not.toContain('bg-warning')
  })

  it('não é verde quando o arquivo cresceu', () => {
    // O caso do JPEG que vira PNG sem perda: 0,76 MB viram 2,23 MB.
    seed({ compressedBytes: 2_230_000, savedPercent: -193.4 }, 'convert')
    render(<FileCard id={ID} />)

    expect(badge().textContent).toBe('+193%')
    expect(badge().className).toContain('bg-warning')
    expect(badge().className).not.toContain('bg-signal')
  })

  it('segue o número que está na tela, não o número cru', () => {
    // −0,2% é exibido como "0%": pintar de âmbar seria a mesma mentira ao
    // contrário. Cor e sinal usam o mesmo arredondamento.
    seed({ compressedBytes: 761_520, savedPercent: -0.2 })
    render(<FileCard id={ID} />)

    expect(badge().textContent).toBe('0%')
    expect(badge().className).toContain('bg-signal')
  })
})

describe('FileCard — o verbo', () => {
  it('diz "Comprimindo" nos modos que comprimem', () => {
    seed({ status: 'running', percent: 62 })
    render(<FileCard id={ID} />)

    expect(screen.getByText('Comprimindo · 62%')).toBeDefined()
  })

  it('diz "Convertendo" no modo converter', () => {
    seed({ status: 'running', percent: 62 }, 'convert')
    render(<FileCard id={ID} />)

    expect(screen.getByText('Convertendo · 62%')).toBeDefined()
  })
})
