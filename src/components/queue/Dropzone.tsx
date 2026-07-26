/**
 * O dropzone — três caminhos de entrada, um componente.
 *
 * Decisões que valem registro:
 *
 * - **É um `<button>`, não uma `div` com `onClick`.** Ganha Enter, Espaço,
 *   foco e papel de botão sem nenhuma linha de ARIA. O brief §7 pede
 *   "totalmente operável por teclado"; a forma mais confiável de conseguir isso
 *   é usar o elemento que já é.
 * - **Dois inputs escondidos**, um com `webkitdirectory`. Não dá para alternar
 *   o atributo no mesmo input de forma confiável entre navegadores, e um seletor
 *   de pasta que às vezes abre arquivos é pior que dois botões honestos.
 * - **Contador de `dragenter`/`dragleave`.** Sem ele, arrastar sobre um filho
 *   dispara `dragleave` do pai e a moldura pisca. É o bug clássico deste
 *   componente.
 * - **Colar (Ctrl+V)** entra de graça: `ClipboardEvent.clipboardData` tem a
 *   mesma forma de `DataTransfer`. Print de tela vira job sem nome de arquivo,
 *   e o motor resolve o formato pelo MIME.
 */

'use client'

import { FolderOpen, ImagePlus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { LogoMark } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { collectDroppedFiles, collectInputFiles } from '@/lib/files'

export interface DropzoneProps {
  onFiles(files: readonly File[]): void
  disabled?: boolean
}

export function Dropzone({ onFiles, disabled = false }: DropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const receive = useCallback(
    (files: readonly File[]) => {
      if (files.length > 0) onFiles(files)
    },
    [onFiles],
  )

  useEffect(() => {
    if (disabled) return

    function onPaste(event: ClipboardEvent): void {
      const transfer = event.clipboardData
      if (!transfer) return

      void collectDroppedFiles(transfer).then(receive)
    }

    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('paste', onPaste)
    }
  }, [disabled, receive])

  function onDragEnter(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    depth.current += 1
    setDragging(true)
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    depth.current -= 1
    if (depth.current <= 0) {
      depth.current = 0
      setDragging(false)
    }
  }

  function onDragOver(event: DragEvent<HTMLDivElement>): void {
    // Sem isto o navegador abre o arquivo numa aba nova em vez de soltar aqui.
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    depth.current = 0
    setDragging(false)
    if (disabled) return

    void collectDroppedFiles(event.dataTransfer).then(receive)
  }

  function pick(input: HTMLInputElement | null): void {
    const files = collectInputFiles(input)
    receive(files)
    // Zerar permite escolher a mesma pasta de novo — sem isto o `change` não
    // dispara na segunda vez.
    if (input) input.value = ''
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'rounded-block border-[1.5px] border-dashed transition-colors',
        dragging
          ? 'border-signal bg-signal-tint'
          : 'border-border bg-surface-raised hover:border-text-muted',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => fileInput.current?.click()}
        className="flex w-full flex-col items-center gap-3 px-6 py-9 text-center"
      >
        <LogoMark size={34} />
        <span className="text-[0.9375rem] font-medium">
          {dragging
            ? 'Solte para adicionar à fila'
            : 'Arraste seus arquivos ou clique para selecionar'}
        </span>
        <span className="text-caption text-text-muted font-mono">
          JPG · PNG · WEBP · AVIF — sem limite, sem upload
        </span>
      </button>

      <div className="flex flex-wrap items-center justify-center gap-3 px-6 pb-7">
        <Button size="sm" disabled={disabled} onClick={() => fileInput.current?.click()}>
          <ImagePlus size={15} aria-hidden />
          Escolher arquivos
        </Button>
        <Button size="sm" disabled={disabled} onClick={() => folderInput.current?.click()}>
          <FolderOpen size={15} aria-hidden />
          Escolher pasta
        </Button>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={() => pick(fileInput.current)}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        // Atributo não padronizado, sem tipagem no React — é como o Chrome, o
        // Edge e o Firefox expõem seleção de pasta.
        {...{ webkitdirectory: '' }}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={() => pick(folderInput.current)}
      />
    </div>
  )
}
