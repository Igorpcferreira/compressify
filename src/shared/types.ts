export type SourceKind = 'file' | 'directory'

export type CompressionMode = 'auto' | 'target'

export type OutputFormat = 'smart' | 'original' | 'jpeg' | 'webp' | 'avif' | 'png'

export type CompressionPreset = 5 | 10 | 50 | 'custom'

export interface SelectedPath {
  path: string
  name: string
}

export interface CompressionOptions {
  sourceKind: SourceKind
  sourcePath: string
  outputDirectory: string
  mode: CompressionMode
  preset: CompressionPreset
  customTargetMb?: number
  outputFormat: OutputFormat
  quality: number
  recursive: boolean
}

export interface CompressionItemResult {
  inputPath: string
  outputPath?: string
  fileName: string
  originalBytes: number
  compressedBytes?: number
  savedBytes?: number
  savedPercent?: number
  status: 'success' | 'warning' | 'error'
  message?: string
}

export interface CompressionSummary {
  totalFiles: number
  successCount: number
  warningCount: number
  errorCount: number
  originalBytes: number
  compressedBytes: number
  savedBytes: number
  savedPercent: number
  outputDirectory: string
}

export interface CompressionResult {
  summary: CompressionSummary
  items: CompressionItemResult[]
}

export interface CompressifyApi {
  selectImage: () => Promise<SelectedPath | null>
  selectDirectory: () => Promise<SelectedPath | null>
  selectOutputDirectory: () => Promise<SelectedPath | null>
  suggestOutputDirectory: (sourcePath: string, sourceKind: SourceKind) => Promise<string>
  compress: (options: CompressionOptions) => Promise<CompressionResult>
  revealPath: (targetPath: string) => Promise<void>
}
