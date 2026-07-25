/// <reference types="vite/client" />

import type { CompressifyApi } from '../../shared/types'

declare global {
  interface Window {
    compressify: CompressifyApi
  }
}
