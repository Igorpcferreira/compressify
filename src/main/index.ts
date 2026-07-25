import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { access, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, parse, relative, resolve } from 'node:path'
import sharp, { type FormatEnum, type Metadata, type Sharp } from 'sharp'
import type {
  CompressionItemResult,
  CompressionOptions,
  CompressionResult,
  OutputFormat,
  SelectedPath,
  SourceKind
} from '../shared/types'

const supportedInputExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff'])
const imageFilters = [
  {
    name: 'Imagens',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff']
  }
]

sharp.cache(false)

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1060,
    minHeight: 720,
    show: false,
    title: 'Compressify',
    backgroundColor: '#050506',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.igorferreira.compressify')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function registerIpcHandlers(): void {
  ipcMain.handle('compressify:select-image', async (): Promise<SelectedPath | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar foto',
      properties: ['openFile'],
      filters: imageFilters
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const selectedPath = result.filePaths[0]
    return {
      path: selectedPath,
      name: basename(selectedPath)
    }
  })

  ipcMain.handle('compressify:select-directory', async (): Promise<SelectedPath | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar pasta com fotos',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const selectedPath = result.filePaths[0]
    return {
      path: selectedPath,
      name: basename(selectedPath)
    }
  })

  ipcMain.handle('compressify:select-output-directory', async (): Promise<SelectedPath | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar pasta de saída',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const selectedPath = result.filePaths[0]
    return {
      path: selectedPath,
      name: basename(selectedPath)
    }
  })

  ipcMain.handle(
    'compressify:suggest-output-directory',
    async (_event, sourcePath: string, sourceKind: SourceKind): Promise<string> => {
      return suggestOutputDirectory(sourcePath, sourceKind)
    }
  )

  ipcMain.handle('compressify:compress', async (_event, options: CompressionOptions): Promise<CompressionResult> => {
    return compressImages(options)
  })

  ipcMain.handle('compressify:reveal-path', async (_event, targetPath: string): Promise<void> => {
    if (!targetPath) {
      return
    }

    try {
      const targetStat = await stat(targetPath)
      if (targetStat.isDirectory()) {
        await shell.openPath(targetPath)
        return
      }

      shell.showItemInFolder(targetPath)
    } catch {
      shell.showItemInFolder(targetPath)
    }
  })
}

function suggestOutputDirectory(sourcePath: string, sourceKind: SourceKind): string {
  if (!sourcePath) {
    return ''
  }

  if (sourceKind === 'file') {
    const parsed = parse(sourcePath)
    return join(parsed.dir, `${parsed.name}_compressify`)
  }

  const cleanPath = resolve(sourcePath)
  return join(dirname(cleanPath), `${basename(cleanPath)}_compressify`)
}

async function compressImages(options: CompressionOptions): Promise<CompressionResult> {
  const normalized = normalizeOptions(options)
  await validateOptions(normalized)
  await mkdir(normalized.outputDirectory, { recursive: true })

  const imagePaths = await collectImagePaths(normalized)

  if (imagePaths.length === 0) {
    throw new Error('Nenhuma imagem compatível foi encontrada na origem selecionada.')
  }

  const items: CompressionItemResult[] = []

  for (const inputPath of imagePaths) {
    const result = await compressSingleImage(inputPath, normalized)
    items.push(result)
  }

  const completedItems = items.filter((item) => item.status !== 'error')
  const originalBytes = completedItems.reduce((total, item) => total + item.originalBytes, 0)
  const compressedBytes = completedItems.reduce((total, item) => total + (item.compressedBytes ?? 0), 0)
  const savedBytes = Math.max(0, originalBytes - compressedBytes)

  return {
    summary: {
      totalFiles: items.length,
      successCount: items.filter((item) => item.status === 'success').length,
      warningCount: items.filter((item) => item.status === 'warning').length,
      errorCount: items.filter((item) => item.status === 'error').length,
      originalBytes,
      compressedBytes,
      savedBytes,
      savedPercent: originalBytes > 0 ? (savedBytes / originalBytes) * 100 : 0,
      outputDirectory: normalized.outputDirectory
    },
    items
  }
}

function normalizeOptions(options: CompressionOptions): CompressionOptions {
  return {
    ...options,
    sourcePath: resolve(options.sourcePath || ''),
    outputDirectory: resolve(options.outputDirectory || ''),
    quality: clampNumber(options.quality, 35, 95),
    customTargetMb:
      typeof options.customTargetMb === 'number' ? Number(options.customTargetMb.toFixed(2)) : options.customTargetMb
  }
}

async function validateOptions(options: CompressionOptions): Promise<void> {
  if (!options.sourcePath || !isAbsolute(options.sourcePath)) {
    throw new Error('Selecione uma origem válida.')
  }

  if (!options.outputDirectory || !isAbsolute(options.outputDirectory)) {
    throw new Error('Selecione uma pasta de saída válida.')
  }

  const sourceStat = await stat(options.sourcePath).catch(() => null)
  if (!sourceStat) {
    throw new Error('A origem selecionada não existe ou não pode ser acessada.')
  }

  if (options.sourceKind === 'file' && !sourceStat.isFile()) {
    throw new Error('A origem precisa ser uma foto quando o modo arquivo estiver selecionado.')
  }

  if (options.sourceKind === 'directory' && !sourceStat.isDirectory()) {
    throw new Error('A origem precisa ser uma pasta quando o modo diretório estiver selecionado.')
  }

  if (options.sourceKind === 'file' && !isSupportedInput(options.sourcePath)) {
    throw new Error('Formato de imagem não suportado. Use JPG, PNG, WebP, AVIF ou TIFF.')
  }

  if (options.sourceKind === 'directory' && samePath(options.sourcePath, options.outputDirectory)) {
    throw new Error('A pasta de saída não pode ser a mesma pasta de origem.')
  }

  if (options.mode === 'target') {
    const targetMb = getTargetMb(options)
    if (!Number.isFinite(targetMb) || targetMb <= 0) {
      throw new Error('Informe uma meta de tamanho válida.')
    }

    if (targetMb < 0.1 || targetMb > 500) {
      throw new Error('A meta personalizada deve ficar entre 0,1 MB e 500 MB.')
    }
  }
}

async function collectImagePaths(options: CompressionOptions): Promise<string[]> {
  if (options.sourceKind === 'file') {
    return [options.sourcePath]
  }

  const results: string[] = []
  await walkDirectory(options.sourcePath, options.outputDirectory, options.recursive, results)
  return results
}

async function walkDirectory(
  currentDirectory: string,
  outputDirectory: string,
  recursive: boolean,
  results: string[]
): Promise<void> {
  if (samePath(currentDirectory, outputDirectory) || isPathInside(currentDirectory, outputDirectory)) {
    return
  }

  const entries = await readdir(currentDirectory, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = join(currentDirectory, entry.name)

    if (entry.isDirectory()) {
      if (recursive) {
        await walkDirectory(entryPath, outputDirectory, recursive, results)
      }
      continue
    }

    if (entry.isFile() && isSupportedInput(entryPath)) {
      results.push(entryPath)
    }
  }
}

async function compressSingleImage(inputPath: string, options: CompressionOptions): Promise<CompressionItemResult> {
  const inputStats = await stat(inputPath)
  const originalBytes = inputStats.size
  const fileName = basename(inputPath)

  try {
    const metadata = await sharp(inputPath, { failOn: 'none' }).metadata()
    const outputFormat = resolveOutputFormat(inputPath, options.outputFormat)
    const outputPath = await buildOutputPath(inputPath, options, outputFormat)
    const targetBytes = options.mode === 'target' ? mbToBytes(getTargetMb(options)) : null
    const compressed = targetBytes
      ? await renderTargeted(inputPath, metadata, outputFormat, originalBytes, targetBytes, options.quality)
      : await renderAutomatic(inputPath, outputFormat, originalBytes, options.quality)

    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, compressed.buffer)

    const compressedBytes = compressed.buffer.byteLength
    const savedBytes = originalBytes - compressedBytes
    const savedPercent = originalBytes > 0 ? (savedBytes / originalBytes) * 100 : 0
    const status = compressed.warning || savedBytes < 0 ? 'warning' : 'success'

    return {
      inputPath,
      outputPath,
      fileName,
      originalBytes,
      compressedBytes,
      savedBytes,
      savedPercent,
      status,
      message: compressed.warning ?? (savedBytes < 0 ? 'Arquivo comprimido ficou maior que o original.' : undefined)
    }
  } catch (error) {
    return {
      inputPath,
      fileName,
      originalBytes,
      status: 'error',
      message: error instanceof Error ? error.message : 'Falha inesperada ao comprimir a imagem.'
    }
  }
}

async function renderAutomatic(
  inputPath: string,
  outputFormat: keyof FormatEnum,
  originalBytes: number,
  requestedQuality: number
): Promise<{ buffer: Buffer; warning?: string }> {
  const qualitySteps = uniqueNumbers([requestedQuality, 82, 74, 66, 58, 48, 38])
  let bestBuffer: Buffer | null = null

  for (const quality of qualitySteps) {
    const buffer = await renderBuffer(inputPath, outputFormat, quality)

    if (!bestBuffer || buffer.byteLength < bestBuffer.byteLength) {
      bestBuffer = buffer
    }

    if (buffer.byteLength < originalBytes) {
      return { buffer }
    }
  }

  return {
    buffer: bestBuffer as Buffer,
    warning: 'Não foi possível reduzir mais sem uma compressão agressiva.'
  }
}

async function renderTargeted(
  inputPath: string,
  metadata: Metadata,
  outputFormat: keyof FormatEnum,
  originalBytes: number,
  requestedTargetBytes: number,
  maxQuality: number
): Promise<{ buffer: Buffer; warning?: string }> {
  const effectiveTargetBytes = Math.min(requestedTargetBytes, Math.max(1024, Math.floor(originalBytes * 0.98)))
  let bestUnderTarget: Buffer | null = null
  let smallestBuffer: Buffer | null = null
  let scale = 1

  for (let scaleAttempt = 0; scaleAttempt < 8; scaleAttempt += 1) {
    let low = 24
    let high = Math.min(maxQuality, 95)

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const quality = Math.floor((low + high) / 2)
      const buffer = await renderBuffer(inputPath, outputFormat, quality, metadata, scale)

      if (!smallestBuffer || buffer.byteLength < smallestBuffer.byteLength) {
        smallestBuffer = buffer
      }

      if (buffer.byteLength <= effectiveTargetBytes) {
        bestUnderTarget = buffer
        low = quality + 1
      } else {
        high = quality - 1
      }
    }

    if (bestUnderTarget) {
      return { buffer: bestUnderTarget }
    }

    if (!canResize(metadata, scale)) {
      break
    }

    scale *= 0.84
  }

  return {
    buffer: smallestBuffer as Buffer,
    warning: 'A imagem foi comprimida no limite possível para as opções selecionadas.'
  }
}

async function renderBuffer(
  inputPath: string,
  outputFormat: keyof FormatEnum,
  quality: number,
  metadata?: Metadata,
  scale = 1
): Promise<Buffer> {
  let pipeline = sharp(inputPath, { failOn: 'none' }).rotate()

  if (metadata && scale < 1 && metadata.width && metadata.height) {
    pipeline = pipeline.resize({
      width: Math.max(1, Math.floor(metadata.width * scale)),
      height: Math.max(1, Math.floor(metadata.height * scale)),
      fit: 'inside',
      withoutEnlargement: true
    })
  }

  return encode(pipeline, outputFormat, clampNumber(quality, 24, 95)).toBuffer()
}

function encode(pipeline: Sharp, format: keyof FormatEnum, quality: number): Sharp {
  switch (format) {
    case 'jpeg':
      return pipeline.jpeg({ quality, mozjpeg: true, force: true })
    case 'webp':
      return pipeline.webp({ quality, effort: 5, force: true })
    case 'avif':
      return pipeline.avif({ quality, effort: 5, force: true })
    case 'png':
      return pipeline.png({
        compressionLevel: 9,
        quality,
        palette: quality < 88,
        effort: 10,
        force: true
      })
    default:
      return pipeline.webp({ quality, effort: 5, force: true })
  }
}

async function buildOutputPath(
  inputPath: string,
  options: CompressionOptions,
  outputFormat: keyof FormatEnum
): Promise<string> {
  const baseDirectory = options.sourceKind === 'directory' ? options.sourcePath : dirname(inputPath)
  const relativeInput = options.sourceKind === 'directory' ? relative(baseDirectory, inputPath) : basename(inputPath)
  const parsed = parse(relativeInput)
  const extension = extensionForFormat(outputFormat)
  const candidate = join(options.outputDirectory, parsed.dir, `${parsed.name}-compressify${extension}`)

  return createUniquePath(candidate)
}

async function createUniquePath(candidatePath: string): Promise<string> {
  const parsed = parse(candidatePath)
  let index = 1
  let nextPath = candidatePath

  while (await pathExists(nextPath)) {
    nextPath = join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`)
    index += 1
  }

  return nextPath
}

function resolveOutputFormat(inputPath: string, selectedFormat: OutputFormat): keyof FormatEnum {
  if (selectedFormat === 'smart') {
    return extname(inputPath).toLowerCase() === '.avif' ? 'avif' : 'webp'
  }

  if (selectedFormat === 'original') {
    const extension = extname(inputPath).toLowerCase()

    if (extension === '.jpg' || extension === '.jpeg') return 'jpeg'
    if (extension === '.png') return 'png'
    if (extension === '.webp') return 'webp'
    if (extension === '.avif') return 'avif'
    return 'jpeg'
  }

  return selectedFormat
}

function extensionForFormat(format: keyof FormatEnum): string {
  switch (format) {
    case 'jpeg':
      return '.jpg'
    case 'png':
      return '.png'
    case 'webp':
      return '.webp'
    case 'avif':
      return '.avif'
    default:
      return '.webp'
  }
}

function getTargetMb(options: CompressionOptions): number {
  if (options.preset === 'custom') {
    return Number(options.customTargetMb)
  }

  return options.preset
}

function mbToBytes(value: number): number {
  return Math.round(value * 1024 * 1024)
}

function isSupportedInput(filePath: string): boolean {
  return supportedInputExtensions.has(extname(filePath).toLowerCase())
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function samePath(a: string, b: string): boolean {
  return resolve(a).toLowerCase() === resolve(b).toLowerCase()
}

function isPathInside(child: string, parent: string): boolean {
  const relation = relative(resolve(parent), resolve(child))
  return relation !== '' && !relation.startsWith('..') && !isAbsolute(relation)
}

function canResize(metadata: Metadata, currentScale: number): boolean {
  if (!metadata.width || !metadata.height) {
    return false
  }

  return Math.floor(metadata.width * currentScale) > 900 && Math.floor(metadata.height * currentScale) > 900
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.map((value) => clampNumber(Math.round(value), 24, 95)))].sort((a, b) => b - a)
}
