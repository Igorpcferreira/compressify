/**
 * As preferências de compressão — os mesmos controles e os mesmos padrões do
 * app Electron (auto · meta 5 MB · formato inteligente · qualidade 82).
 *
 * A meta de tamanho só aparece no modo meta, e o campo personalizado só aparece
 * no preset "Livre". Mostrar controles inertes ensina o usuário a ignorar a
 * tela; esconder o que não se aplica é o que o board desenha.
 *
 * Os controles ficam desabilitados enquanto a fila roda: mudar a qualidade no
 * meio do lote produziria resultados inconsistentes entre os cards, e o
 * orquestrador recebe as opções uma vez, no `run`.
 */

'use client'

import { Settings2 } from 'lucide-react'
import { ChipGroup } from '@/components/ui/Chip'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Slider } from '@/components/ui/Slider'
import type { CompressionMode, CompressionPreset, OutputFormat } from '@/engine/core/types'
import {
  CUSTOM_TARGET_RANGE,
  QUALITY_RANGE,
  selectOptions,
  selectPhase,
  useQueueStore,
} from '@/store/queue'

const MODES = [
  { value: 'auto' as CompressionMode, label: 'Auto', description: 'Modo automático' },
  { value: 'target' as CompressionMode, label: 'Meta', description: 'Meta de tamanho' },
]

const PRESETS = [
  { value: 5 as CompressionPreset, label: '5 MB' },
  { value: 10 as CompressionPreset, label: '10 MB' },
  { value: 50 as CompressionPreset, label: '50 MB' },
  { value: 'custom' as CompressionPreset, label: 'Livre', description: 'Meta personalizada' },
]

const FORMATS = [
  { value: 'smart' as OutputFormat, label: 'Inteligente' },
  { value: 'original' as OutputFormat, label: 'Original' },
  { value: 'jpeg' as OutputFormat, label: 'JPG' },
  { value: 'webp' as OutputFormat, label: 'WebP' },
  { value: 'avif' as OutputFormat, label: 'AVIF' },
  { value: 'png' as OutputFormat, label: 'PNG' },
]

export function OptionsPanel() {
  const options = useQueueStore(selectOptions)
  const setOptions = useQueueStore((state) => state.setOptions)
  const disabled = useQueueStore(selectPhase) === 'running'

  return (
    <section
      aria-label="Preferências de compressão"
      className="border-border bg-surface-raised rounded-card flex flex-col gap-7 border p-7"
    >
      <div className="flex items-center gap-3">
        <Settings2 size={18} className="text-text-muted" aria-hidden />
        <h2 className="text-h3">Preferências</h2>
      </div>

      <div className="flex flex-wrap items-start gap-x-8 gap-y-6">
        <div className="flex flex-col gap-3">
          <span className="text-eyebrow text-text-muted uppercase">Modo</span>
          <SegmentedControl
            label="Modo de compressão"
            value={options.mode}
            options={MODES}
            disabled={disabled}
            onChange={(mode) => setOptions({ mode })}
          />
        </div>

        {options.mode === 'target' && (
          <div className="flex flex-col gap-3">
            <span className="text-eyebrow text-text-muted uppercase">Meta de tamanho</span>
            <div className="flex flex-wrap items-center gap-3.5">
              <SegmentedControl
                label="Meta de tamanho"
                value={options.preset}
                options={PRESETS}
                mono
                disabled={disabled}
                onChange={(preset) => setOptions({ preset })}
              />

              {options.preset === 'custom' && (
                <label className="border-border bg-surface-raised h-control rounded-button flex items-center gap-2 border px-3.5">
                  <span className="sr-only">Meta personalizada em MB</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={CUSTOM_TARGET_RANGE.min}
                    max={CUSTOM_TARGET_RANGE.max}
                    step={0.1}
                    disabled={disabled}
                    value={options.customTargetMb ?? 10}
                    onChange={(event) => setOptions({ customTargetMb: Number(event.target.value) })}
                    className="text-data w-16 bg-transparent font-mono font-medium outline-none"
                  />
                  <span className="text-caption text-text-muted font-mono">MB</span>
                </label>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-eyebrow text-text-muted uppercase">Formato de saída</span>
        <ChipGroup
          label="Formato de saída"
          value={options.outputFormat}
          options={FORMATS}
          disabled={disabled}
          onChange={(outputFormat) => setOptions({ outputFormat })}
        />
      </div>

      <Slider
        label="Qualidade base"
        value={options.quality}
        min={QUALITY_RANGE.min}
        max={QUALITY_RANGE.max}
        disabled={disabled}
        minLabel="menor arquivo"
        maxLabel="sem perda"
        onChange={(quality) => setOptions({ quality })}
      />
    </section>
  )
}
