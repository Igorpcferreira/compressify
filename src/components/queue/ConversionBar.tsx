/**
 * O seletor "de X para Y" — a porta de entrada da conversão.
 *
 * **Duas decisões que valem discussão.**
 *
 * 1. **São `<select>` nativos, sem campo de busca.** O padrão que o estudo cita
 *    (docs/PLANO-CONVERSAO.md §2) tem busca porque lista 300 formatos; aqui são
 *    quatro. Uma caixa de busca sobre quatro opções é cerimônia — e o `select`
 *    nativo já faz busca por digitação, além de trazer teclado, leitor de tela
 *    e o seletor de rolagem do celular sem uma linha de ARIA. Quando o
 *    Incremento 15 trouxer 247 formatos de entrada, aí sim um combobox com
 *    busca se paga; construí-lo agora seria escrever hoje o código de um
 *    problema que ainda não existe.
 * 2. **A origem não filtra o motor.** Ela dá contexto e conta o que destoa. Quem
 *    chega por `/jpg-para-webp` e arrasta um PNG tem o PNG convertido do mesmo
 *    jeito, com uma linha dizendo que sim — recusar seria transformar uma
 *    escolha de vitrine em regra de negócio, e é o erro contra o qual o
 *    docs/HANDOFF-CONVERSAO.md §6 avisa explicitamente.
 *
 * O destino é o mesmo valor que os chips do painel: um estado só, dois
 * controles. Escolher aqui também liga o modo Converter, que é o que a pessoa
 * quer dizer quando escolhe um par.
 */

'use client'

import { ArrowRight } from 'lucide-react'
import type { ImageFormat } from '@/engine/core/types'
import { FORMATS } from '@/lib/conversions'
import {
  selectMode,
  selectOptions,
  selectPhase,
  selectSourceFormat,
  selectStats,
  useQueueStore,
} from '@/store/queue'

const SELECT_CLASS =
  'border-border bg-surface-raised h-control rounded-button text-small text-text px-3 ' +
  'transition-colors disabled:opacity-50 border'

/** Só os quatro concretos: `smart` e `original` não são um destino, são uma regra. */
function isConcreteFormat(value: string): value is ImageFormat {
  return FORMATS.some((format) => format.id === value)
}

export function ConversionBar() {
  const options = useQueueStore(selectOptions)
  const mode = useQueueStore(selectMode)
  const source = useQueueStore(selectSourceFormat)
  const stats = useQueueStore(selectStats)
  const setSourceFormat = useQueueStore((state) => state.setSourceFormat)
  const applyConversion = useQueueStore((state) => state.applyConversion)
  const disabled = useQueueStore(selectPhase) === 'running'

  // `smart` e `original` não são um formato de destino — o painel é quem manda
  // nesse caso, e o seletor diz isso em vez de fingir uma escolha.
  const target = isConcreteFormat(options.outputFormat) ? options.outputFormat : ''

  return (
    <section
      aria-label="Conversão de formato"
      className="border-border bg-surface-raised rounded-card flex flex-col gap-2.5 border p-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <span className="text-small text-text-muted">Converter de</span>

        <select
          aria-label="Formato de origem"
          className={SELECT_CLASS}
          disabled={disabled}
          value={source ?? ''}
          onChange={(event) => {
            const value = event.target.value
            setSourceFormat(isConcreteFormat(value) ? value : null)
          }}
        >
          <option value="">qualquer formato</option>
          {FORMATS.map((format) => (
            <option key={format.id} value={format.id}>
              {format.label}
            </option>
          ))}
        </select>

        <ArrowRight size={16} className="text-text-muted" aria-hidden />

        <select
          aria-label="Formato de destino"
          className={SELECT_CLASS}
          disabled={disabled}
          value={target}
          onChange={(event) => {
            const value = event.target.value
            if (isConcreteFormat(value)) applyConversion({ from: source, to: value })
          }}
        >
          <option value="" disabled>
            escolha o destino
          </option>
          {FORMATS.map((format) => (
            <option key={format.id} value={format.id}>
              {format.label}
            </option>
          ))}
        </select>
      </div>

      {/*
        A linha que impede a recusa silenciosa. `status` e não `alert`: nada
        deu errado — é informação sobre o que vai acontecer.
      */}
      {source && stats.foreign > 0 ? (
        <p role="status" className="text-caption text-text-muted">
          {stats.foreign === 1
            ? 'Um arquivo da fila não é '
            : `${stats.foreign} arquivos da fila não são `}
          {FORMATS.find((format) => format.id === source)?.label}
          {stats.foreign === 1 ? '. Ele será convertido' : '. Eles serão convertidos'} do mesmo
          jeito.
        </p>
      ) : null}

      {mode !== 'convert' && target ? (
        <p className="text-caption text-text-muted">
          O modo atual comprime além de converter. Para trocar só o formato, escolha{' '}
          <strong className="text-text font-medium">Converter</strong> nas preferências.
        </p>
      ) : null}
    </section>
  )
}
