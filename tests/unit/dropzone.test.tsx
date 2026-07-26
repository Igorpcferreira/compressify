// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dropzone } from '@/components/queue/Dropzone'
import { imageFile } from '../helpers/images'

afterEach(cleanup)

/**
 * O teste de componente aqui é deliberadamente estreito: o `PLANO.md` §8 diz
 * para não perseguir cobertura de UI. O que é coberto são as três coisas que
 * quebram sem alarde — teclado, o contador de `dragenter`/`dragleave`, e a
 * varredura assíncrona do `drop`.
 */
function transferWith(files: File[]) {
  return {
    items: files.map((file) => ({
      kind: 'file',
      webkitGetAsEntry: () => null,
      getAsFile: () => file,
    })),
    files,
  }
}

describe('Dropzone', () => {
  it('é um botão de verdade — foco e teclado sem ARIA extra', () => {
    render(<Dropzone onFiles={() => {}} />)

    const zone = screen.getByRole('button', { name: /arraste seus arquivos/i })
    zone.focus()

    expect(document.activeElement).toBe(zone)
    expect(zone.tagName).toBe('BUTTON')
  })

  it('oferece escolher arquivos e escolher pasta', () => {
    render(<Dropzone onFiles={() => {}} />)

    expect(screen.getByRole('button', { name: 'Escolher arquivos' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Escolher pasta' })).toBeDefined()
  })

  it('entrega os arquivos soltos', async () => {
    const onFiles = vi.fn()
    render(<Dropzone onFiles={onFiles} />)

    const files = [imageFile({ name: 'a.jpg' }), imageFile({ name: 'b.png' })]
    fireEvent.drop(screen.getByRole('button', { name: /arraste/i }).parentElement as HTMLElement, {
      dataTransfer: transferWith(files),
    })

    await waitFor(() => {
      expect(onFiles).toHaveBeenCalledTimes(1)
    })
    expect(onFiles.mock.calls[0]?.[0]).toEqual(files)
  })

  it('mantém a moldura ativa quando o ponteiro passa sobre um filho', () => {
    render(<Dropzone onFiles={() => {}} />)
    const zone = screen.getByRole('button', { name: /arraste/i }).parentElement as HTMLElement

    fireEvent.dragEnter(zone)
    expect(screen.getByText('Solte para adicionar à fila')).toBeDefined()

    // Entrar num filho dispara `dragleave` no pai. Sem o contador, a moldura
    // pisca a cada movimento do mouse — o bug clássico deste componente.
    fireEvent.dragEnter(zone)
    fireEvent.dragLeave(zone)
    expect(screen.getByText('Solte para adicionar à fila')).toBeDefined()

    fireEvent.dragLeave(zone)
    expect(screen.getByText(/arraste seus arquivos/i)).toBeDefined()
  })

  it('aceita colar do clipboard', async () => {
    const onFiles = vi.fn()
    render(<Dropzone onFiles={onFiles} />)

    const colado = imageFile({ name: 'captura.png', type: 'image/png' })
    const event = new Event('paste') as Event & { clipboardData: unknown }
    event.clipboardData = transferWith([colado])
    document.dispatchEvent(event)

    await waitFor(() => {
      expect(onFiles).toHaveBeenCalledWith([colado])
    })
  })

  it('não reage quando está desabilitado', async () => {
    const onFiles = vi.fn()
    render(<Dropzone onFiles={onFiles} disabled />)

    const colado = imageFile({ name: 'captura.png' })
    const event = new Event('paste') as Event & { clipboardData: unknown }
    event.clipboardData = transferWith([colado])
    document.dispatchEvent(event)

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(onFiles).not.toHaveBeenCalled()
  })
})
