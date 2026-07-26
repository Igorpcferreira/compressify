/**
 * Antes e depois, com a divisória no meio.
 *
 * É a pergunta que todo mundo faz — "perdeu qualidade?" — e até aqui o produto
 * respondia com um número de bytes, que é a resposta para outra pergunta.
 *
 * ### Três decisões que valem discussão
 *
 * 1. **A divisória é um `<input type="range">` de verdade**, transparente, por
 *    cima das imagens. Não é uma `div` com `onPointerMove`. Range nativo já traz
 *    setas, Home/End, PageUp/PageDown, toque e anúncio de valor — e é a mesma
 *    escolha que o `Slider` de qualidade fez, pelo mesmo motivo: acessibilidade
 *    é o que se perde primeiro quando se reconstrói um controle nativo à mão.
 *
 * 2. **É um `<dialog>` nativo**, aberto com `showModal()`. Ele traz armadilha de
 *    foco, `Esc` para fechar, o resto da página marcado como inerte e o
 *    backdrop — quatro comportamentos que uma modal caseira erra um a um. O
 *    `useEffect` só faz a ponte com o DOM imperativo, que é o que o React não
 *    cobre aqui.
 *
 * 3. **As object URLs vivem enquanto a modal vive.** Duas por vez, criadas ao
 *    abrir e revogadas ao fechar. Criá-las no card, para os 50 arquivos de uma
 *    vez, seguraria o lote inteiro na memória — o oposto do que `lib/download.ts`
 *    aprendeu a fazer (docs/HANDOFF.md §9).
 *
 * O "antes" é o arquivo original, decodificado pelo navegador. O "depois" é o
 * resultado. Nenhum dos dois passa por canvas: a comparação é entre o que o
 * usuário tinha e o que ele vai baixar, sem intermediário que possa mentir.
 *
 * ### Sobre o `<img>` em vez do `next/image`
 *
 * O lint do Next pede `next/image` em todo `<img>`, e aqui ele está errado por
 * dois motivos independentes. O primeiro é de produto: `next/image` existe para
 * mandar a imagem a um otimizador, e mandar o arquivo do usuário a um
 * otimizador é exatamente a coisa que este projeto promete não fazer. O
 * segundo é de fato: a fonte é uma `blob:` URL da memória do próprio navegador,
 * que nenhum loader consegue reescrever — e a exportação é estática, sem
 * otimizador nenhum no deploy. A regra é desligada nas duas linhas, com este
 * parágrafo como justificativa.
 */

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatBytes, formatSavedPercent } from '@/lib/format'
import type { QueueItem } from '@/store/queue'

export interface CompareDialogProps {
  item: QueueItem
  onClose(): void
}

export function CompareDialog({ item, onClose }: CompareDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [position, setPosition] = useState(50)

  // `useMemo` e não `useState` + efeito: as URLs derivam do item, e derivar em
  // efeito criaria um quadro com `src=""` — que no Safari pisca.
  const urls = useMemo(() => {
    const original = URL.createObjectURL(item.file)
    const comprimido = item.blob ? URL.createObjectURL(item.blob) : null
    return { original, comprimido }
  }, [item.file, item.blob])

  useEffect(
    () => () => {
      URL.revokeObjectURL(urls.original)
      if (urls.comprimido) URL.revokeObjectURL(urls.comprimido)
    },
    [urls],
  )

  useEffect(() => {
    const element = dialog.current
    if (!element || element.open) return

    element.showModal()
    return () => {
      if (element.open) element.close()
    }
  }, [])

  if (!urls.comprimido) return null

  return (
    <dialog
      ref={dialog}
      // `Esc` dispara `close` sem passar por nenhum handler nosso — sem isto a
      // modal fecharia no DOM e continuaria montada no React.
      onClose={onClose}
      onClick={(event) => {
        // Clique no backdrop: o alvo é o próprio `<dialog>`, nunca um filho.
        if (event.target === dialog.current) dialog.current?.close()
      }}
      aria-label={`Comparação antes e depois de ${item.name}`}
      className="bg-surface-raised text-text rounded-card border-border m-auto w-[min(92vw,68rem)] border p-0 backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-h3 truncate font-mono" title={item.path}>
            {item.name}
          </h2>

          <Button size="sm" variant="ghost" onClick={() => dialog.current?.close()}>
            <X size={15} aria-hidden />
            Fechar
          </Button>
        </div>

        <div className="relative overflow-hidden rounded-[10px] select-none">
          {/*
            O comprimido fica embaixo, inteiro, e o original é recortado por
            cima. Assim a divisória revela o *depois* conforme avança para a
            esquerda, que é a leitura natural de "o que a compressão fez".
          */}
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: local, sem otimizador; ver o topo do arquivo */}
          <img
            src={urls.comprimido}
            alt={`${item.name} depois da compressão`}
            className="block max-h-[62vh] w-full bg-[repeating-conic-gradient(var(--color-border)_0_25%,transparent_0_50%)] bg-[length:20px_20px] object-contain"
          />

          {/* eslint-disable-next-line @next/next/no-img-element -- blob: local, sem otimizador; ver o topo do arquivo */}
          {/*
            Sem `aria-hidden`: as duas são conteúdo, não decoração. A de cima é
            o arquivo original e a de baixo é o resultado — descrevê-las
            separadamente é o que dá a alguém que não enxerga a divisória a
            mesma informação que a divisória dá a quem enxerga.
          */}
          <img
            src={urls.original}
            alt={`${item.name} antes da compressão`}
            className="absolute inset-0 block h-full w-full object-contain"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          />

          <div
            aria-hidden
            className="bg-signal pointer-events-none absolute inset-y-0 w-0.5"
            style={{ left: `${position}%` }}
          />

          <span
            aria-hidden
            className="text-caption bg-ink/75 pointer-events-none absolute top-3 left-3 rounded-full px-2.5 py-1 font-mono text-white"
          >
            antes · {formatBytes(item.originalBytes)}
          </span>

          <span
            aria-hidden
            className="text-caption bg-ink/75 pointer-events-none absolute top-3 right-3 rounded-full px-2.5 py-1 font-mono text-white"
          >
            depois · {formatBytes(item.compressedBytes ?? 0)}
          </span>

          <input
            type="range"
            min={0}
            max={100}
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
            aria-label="Posição da divisória entre antes e depois"
            className="absolute inset-0 h-full w-full cursor-ew-resize appearance-none bg-transparent [&::-moz-range-thumb]:h-full [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:h-[62vh] [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-transparent"
          />
        </div>

        <p className="text-small text-text-muted">
          {item.width !== null && item.height !== null ? (
            <>
              {item.width}×{item.height} ·{' '}
            </>
          ) : null}
          {formatBytes(item.originalBytes)} → {formatBytes(item.compressedBytes ?? 0)} ·{' '}
          <strong className="text-text">{formatSavedPercent(item.savedPercent ?? 0)}</strong> ·
          arraste a divisória ou use as setas do teclado
        </p>
      </div>
    </dialog>
  )
}
