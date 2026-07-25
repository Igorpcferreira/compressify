import { contextBridge, ipcRenderer } from 'electron'
import type { CompressionOptions, CompressifyApi, SelectedPath, SourceKind } from '../shared/types'

const api: CompressifyApi = {
  selectImage: () => ipcRenderer.invoke('compressify:select-image') as Promise<SelectedPath | null>,
  selectDirectory: () => ipcRenderer.invoke('compressify:select-directory') as Promise<SelectedPath | null>,
  selectOutputDirectory: () =>
    ipcRenderer.invoke('compressify:select-output-directory') as Promise<SelectedPath | null>,
  suggestOutputDirectory: (sourcePath: string, sourceKind: SourceKind) =>
    ipcRenderer.invoke('compressify:suggest-output-directory', sourcePath, sourceKind) as Promise<string>,
  compress: (options: CompressionOptions) =>
    ipcRenderer.invoke('compressify:compress', options) as ReturnType<CompressifyApi['compress']>,
  revealPath: (targetPath: string) => ipcRenderer.invoke('compressify:reveal-path', targetPath) as Promise<void>
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('compressify', api)
} else {
  ;(window as unknown as { compressify: CompressifyApi }).compressify = api
}
