/**
 * Contratos do motor de compressão.
 *
 * Mantidos genéricos de propósito: a Fase 2 (PDF) e a Fase 3 (vídeo/áudio)
 * entram registrando novos `CompressionEngine`, sem tocar na fila nem no
 * orquestrador. Ver docs/PLANO.md §1.2.
 */

/** Modo de compressão escolhido pelo usuário. */
export type CompressionMode = 'auto' | 'target'

/** O que o usuário escolhe no seletor de formato. */
export type OutputFormat = 'smart' | 'original' | 'jpeg' | 'webp' | 'avif' | 'png'

/** Formato concreto que um encoder sabe produzir — `smart`/`original` já resolvidos. */
export type ImageFormat = 'jpeg' | 'webp' | 'avif' | 'png'

/** Metas de tamanho pré-definidas, em MB. `custom` usa `customTargetMb`. */
export type CompressionPreset = 5 | 10 | 50 | 'custom'

export type JobStatus = 'queued' | 'running' | 'success' | 'warning' | 'error' | 'cancelled'

export interface JobOptions {
  mode: CompressionMode
  preset: CompressionPreset
  customTargetMb?: number
  outputFormat: OutputFormat
  /** Qualidade base, 35–95 na UI; o motor clampa em 24–95. */
  quality: number
}

export interface FileMetadata {
  width: number
  height: number
  /** Formato detectado na entrada, quando reconhecido. */
  format: ImageFormat | null
  /** Bytes do arquivo original. */
  bytes: number
}

export interface JobContext {
  onProgress(percent: number): void
  readonly signal: AbortSignal
}

export interface JobResult {
  blob: Blob
  outputName: string
  originalBytes: number
  compressedBytes: number
  savedBytes: number
  savedPercent: number
  status: Extract<JobStatus, 'success' | 'warning'>
  message?: string
  /** Dimensões finais — diferem da origem quando houve downscale. */
  width: number
  height: number
}

export interface CompressionEngine {
  readonly id: string
  supports(file: File): boolean
  probe(file: File): Promise<FileMetadata>
  process(file: File, options: JobOptions, ctx: JobContext): Promise<JobResult>
}
