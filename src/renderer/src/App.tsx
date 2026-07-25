import { useMemo, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  FileImage,
  FolderOpen,
  Gauge,
  HardDrive,
  ImageIcon,
  Loader2,
  Lock,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  Target,
  XCircle,
  Zap
} from 'lucide-react'
import type {
  CompressionMode,
  CompressionPreset,
  CompressionResult,
  OutputFormat,
  SelectedPath,
  SourceKind
} from '../../shared/types'

const presets: Array<{ label: string; value: CompressionPreset }> = [
  { label: '5 MB', value: 5 },
  { label: '10 MB', value: 10 },
  { label: '50 MB', value: 50 },
  { label: 'Livre', value: 'custom' }
]

const outputFormats: Array<{ label: string; value: OutputFormat }> = [
  { label: 'Inteligente', value: 'smart' },
  { label: 'Original', value: 'original' },
  { label: 'JPG', value: 'jpeg' },
  { label: 'WebP', value: 'webp' },
  { label: 'AVIF', value: 'avif' },
  { label: 'PNG', value: 'png' }
]

function App(): ReactElement {
  const [sourceKind, setSourceKind] = useState<SourceKind>('directory')
  const [source, setSource] = useState<SelectedPath | null>(null)
  const [outputDirectory, setOutputDirectory] = useState('')
  const [mode, setMode] = useState<CompressionMode>('auto')
  const [preset, setPreset] = useState<CompressionPreset>(5)
  const [customTargetMb, setCustomTargetMb] = useState(25)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('smart')
  const [quality, setQuality] = useState(82)
  const [recursive, setRecursive] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<CompressionResult | null>(null)

  const validationMessage = useMemo(() => {
    if (!source) return 'Selecione uma origem.'
    if (!outputDirectory) return 'Selecione uma pasta de saída.'
    if (mode === 'target' && preset === 'custom' && (!customTargetMb || customTargetMb < 0.1 || customTargetMb > 500)) {
      return 'A meta personalizada deve ficar entre 0,1 MB e 500 MB.'
    }

    return ''
  }, [customTargetMb, mode, outputDirectory, preset, source])

  async function handleSourceKindChange(nextKind: SourceKind): Promise<void> {
    setSourceKind(nextKind)
    setSource(null)
    setOutputDirectory('')
    setResult(null)
    setError('')
  }

  async function handleSelectSource(): Promise<void> {
    setError('')
    setResult(null)

    const selected = sourceKind === 'file' ? await window.compressify.selectImage() : await window.compressify.selectDirectory()

    if (!selected) {
      return
    }

    setSource(selected)
    const suggestedOutput = await window.compressify.suggestOutputDirectory(selected.path, sourceKind)
    setOutputDirectory(suggestedOutput)
  }

  async function handleSelectOutput(): Promise<void> {
    const selected = await window.compressify.selectOutputDirectory()

    if (!selected) {
      return
    }

    setOutputDirectory(selected.path)
    setError('')
  }

  async function handleCompress(): Promise<void> {
    setError('')

    if (validationMessage) {
      setError(validationMessage)
      return
    }

    if (!source) {
      return
    }

    setIsRunning(true)
    setResult(null)

    try {
      const compressionResult = await window.compressify.compress({
        sourceKind,
        sourcePath: source.path,
        outputDirectory,
        mode,
        preset,
        customTargetMb,
        outputFormat,
        quality,
        recursive
      })

      setResult(compressionResult)
    } catch (compressError) {
      setError(compressError instanceof Error ? compressError.message : 'Falha inesperada ao comprimir as fotos.')
    } finally {
      setIsRunning(false)
    }
  }

  function handleReset(): void {
    setSource(null)
    setOutputDirectory('')
    setMode('auto')
    setPreset(5)
    setCustomTargetMb(25)
    setOutputFormat('smart')
    setQuality(82)
    setRecursive(true)
    setError('')
    setResult(null)
  }

  const completedLabel = result
    ? `${result.summary.successCount + result.summary.warningCount}/${result.summary.totalFiles}`
    : '0/0'

  return (
    <main className="app-shell">
      <div className="background-grid" />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <ImageIcon size={24} />
          </div>
          <div>
            <span className="eyebrow">Igor Ferreira</span>
            <h1>Compressify</h1>
          </div>
        </div>

        <div className="topbar-actions">
          <span className="status-pill">
            <Lock size={15} />
            Local
          </span>
          <button className="ghost-button" type="button" onClick={handleReset}>
            <RotateCcw size={17} />
            Limpar
          </button>
        </div>
      </header>

      <section className="hero-strip" aria-label="Resumo">
        <div>
          <span className="eyebrow">Compressor de fotos</span>
          <h2>Arquivo único ou pasta completa, com meta de tamanho e saída profissional.</h2>
        </div>
        <div className="hero-stats" aria-label="Status da compressão">
          <div>
            <span>{completedLabel}</span>
            <small>processadas</small>
          </div>
          <div>
            <span>{result ? formatBytes(result.summary.savedBytes) : '0 B'}</span>
            <small>economizados</small>
          </div>
        </div>
      </section>

      <div className="workspace">
        <section className="control-panel" aria-label="Controles de compressão">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Origem</span>
              <h3>Fotos</h3>
            </div>
            <FolderOpen size={20} />
          </div>

          <div className="segmented" role="tablist" aria-label="Tipo de origem">
            <button
              className={sourceKind === 'directory' ? 'active' : ''}
              type="button"
              onClick={() => void handleSourceKindChange('directory')}
            >
              <FolderOpen size={16} />
              Pasta
            </button>
            <button
              className={sourceKind === 'file' ? 'active' : ''}
              type="button"
              onClick={() => void handleSourceKindChange('file')}
            >
              <FileImage size={16} />
              Arquivo
            </button>
          </div>

          <button className="picker-button" type="button" onClick={() => void handleSelectSource()}>
            <span>
              {sourceKind === 'directory' ? <FolderOpen size={20} /> : <FileImage size={20} />}
              {source ? source.name : sourceKind === 'directory' ? 'Selecionar pasta' : 'Selecionar foto'}
            </span>
            <ChevronRight size={18} />
          </button>

          {source && <PathBox label="Origem selecionada" value={source.path} />}

          <div className="panel-heading compact">
            <div>
              <span className="eyebrow">Destino</span>
              <h3>Saída</h3>
            </div>
            <HardDrive size={20} />
          </div>

          <button className="picker-button secondary" type="button" onClick={() => void handleSelectOutput()}>
            <span>
              <FolderOpen size={20} />
              {outputDirectory ? 'Alterar pasta de saída' : 'Selecionar saída'}
            </span>
            <ChevronRight size={18} />
          </button>

          {outputDirectory && <PathBox label="Pasta de saída" value={outputDirectory} />}

          <div className="panel-heading compact">
            <div>
              <span className="eyebrow">Compressão</span>
              <h3>Preferências</h3>
            </div>
            <Settings2 size={20} />
          </div>

          <div className="segmented" role="tablist" aria-label="Modo de compressão">
            <button className={mode === 'auto' ? 'active' : ''} type="button" onClick={() => setMode('auto')}>
              <Sparkles size={16} />
              Auto
            </button>
            <button className={mode === 'target' ? 'active' : ''} type="button" onClick={() => setMode('target')}>
              <Target size={16} />
              Meta
            </button>
          </div>

          {mode === 'target' && (
            <div className="preset-grid" aria-label="Metas de tamanho">
              {presets.map((item) => (
                <button
                  className={preset === item.value ? 'active' : ''}
                  key={item.label}
                  type="button"
                  onClick={() => setPreset(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {mode === 'target' && preset === 'custom' && (
            <label className="field-label">
              Meta personalizada em MB
              <input
                min={0.1}
                max={500}
                step={0.1}
                type="number"
                value={customTargetMb}
                onChange={(event) => setCustomTargetMb(Number(event.target.value))}
              />
            </label>
          )}

          <label className="field-label">
            Formato de saída
            <select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}>
              {outputFormats.map((format) => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label range-label">
            <span>
              Qualidade base
              <strong>{quality}%</strong>
            </span>
            <input
              min={35}
              max={95}
              step={1}
              type="range"
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
            />
          </label>

          {sourceKind === 'directory' && (
            <label className="toggle-row">
              <input checked={recursive} type="checkbox" onChange={(event) => setRecursive(event.target.checked)} />
              <span>Incluir subpastas</span>
            </label>
          )}

          {error && (
            <div className="message error-message" role="alert">
              <AlertTriangle size={18} />
              {error}
            </div>
          )}

          <button className="primary-action" disabled={isRunning || Boolean(validationMessage)} type="button" onClick={() => void handleCompress()}>
            {isRunning ? <Loader2 className="spin" size={20} /> : <Play size={20} />}
            {isRunning ? 'Comprimindo...' : 'Comprimir fotos'}
          </button>
        </section>

        <section className="result-panel" aria-label="Resultados">
          <div className="result-header">
            <div>
              <span className="eyebrow">Relatório</span>
              <h3>Resultado da sessão</h3>
            </div>
            {result && (
              <button
                className="ghost-button"
                type="button"
                onClick={() => void window.compressify.revealPath(result.summary.outputDirectory)}
              >
                <FolderOpen size={17} />
                Abrir saída
              </button>
            )}
          </div>

          {!result && (
            <div className="empty-state">
              <div className="empty-icon">
                <Zap size={34} />
              </div>
              <h4>{isRunning ? 'Processando imagens' : 'Pronto para começar'}</h4>
              <p>{isRunning ? 'Aguarde o relatório final desta sessão.' : 'Escolha uma origem, ajuste as opções e inicie a compressão.'}</p>
            </div>
          )}

          {result && (
            <>
              <div className="metric-grid">
                <MetricCard icon={<BadgeCheck size={20} />} label="Concluídas" value={String(result.summary.successCount)} />
                <MetricCard icon={<Gauge size={20} />} label="Economia" value={`${result.summary.savedPercent.toFixed(1)}%`} />
                <MetricCard icon={<HardDrive size={20} />} label="Antes" value={formatBytes(result.summary.originalBytes)} />
                <MetricCard icon={<Sparkles size={20} />} label="Depois" value={formatBytes(result.summary.compressedBytes)} />
              </div>

              <div className="result-list" role="list">
                {result.items.map((item) => (
                  <article className="result-row" key={item.inputPath} role="listitem">
                    <div className={`status-icon ${item.status}`}>
                      {item.status === 'success' && <CheckCircle2 size={18} />}
                      {item.status === 'warning' && <AlertTriangle size={18} />}
                      {item.status === 'error' && <XCircle size={18} />}
                    </div>
                    <div className="result-main">
                      <strong>{item.fileName}</strong>
                      <span>{item.message ?? item.outputPath}</span>
                    </div>
                    <div className="result-size">
                      <span>{formatBytes(item.originalBytes)}</span>
                      <small>{item.compressedBytes ? formatBytes(item.compressedBytes) : 'falhou'}</small>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

function PathBox({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="path-box">
      <span>{label}</span>
      <code title={value}>{value}</code>
    </div>
  )
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }): ReactElement {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  const precision = value >= 10 || exponent === 0 ? 0 : 1

  return `${value.toFixed(precision)} ${units[exponent]}`
}

export default App
