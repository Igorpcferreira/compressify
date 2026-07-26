/**
 * Inicialização dos codecs reais para rodar em Node.
 *
 * No navegador nada disto é necessário: cada pacote do jSquash busca seu
 * `.wasm` sozinho, por `fetch`. Em Node o `fetch` não atende `file://`, então
 * os testes de integração passam os bytes na mão. É a única concessão que os
 * testes fazem — o motor sob teste é o de produção, com `browserCodecs`.
 *
 * O que isto **não** cobre: o caminho de decode nativo
 * (`createImageBitmap` + `OffscreenCanvas`), que não existe em Node. Em Node o
 * `decodeImage` cai sozinho no fallback WASM, que é justamente o caminho mais
 * difícil de exercitar num navegador. O nativo fica para o E2E do Incremento 7.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

function codecPath(relative: string): string {
  return fileURLToPath(new URL(`../../node_modules/@jsquash/${relative}`, import.meta.url))
}

async function compiled(relative: string): Promise<WebAssembly.Module> {
  return await WebAssembly.compile(await readFile(codecPath(relative)))
}

/**
 * O glue emscripten do jSquash já injeta um `ImageData` mínimo quando detecta
 * Node — mas só quando um codec emscripten é carregado primeiro. O `oxipng`
 * faz `data instanceof ImageData` e quebraria se a ordem de carga mudasse.
 * Declarar aqui tira a suíte da dependência de ordem.
 */
function ensureImageData(): void {
  if (typeof globalThis.ImageData !== 'undefined') return

  globalThis.ImageData = class {
    readonly data: Uint8ClampedArray
    readonly width: number
    readonly height: number
    readonly colorSpace: PredefinedColorSpace = 'srgb'

    constructor(data: Uint8ClampedArray, width: number, height?: number) {
      this.data = data
      this.width = width
      this.height = height ?? data.length / 4 / width
    }
  } as unknown as typeof ImageData
}

let ready: Promise<void> | null = null

/** Idempotente: os módulos WASM são compilados uma vez por processo de teste. */
export function initNodeCodecs(): Promise<void> {
  ready ??= (async () => {
    ensureImageData()

    const [jpegEncode, jpegDecode, webpEncode, webpDecode, pngEncode, pngDecode, oxipng, resize] =
      await Promise.all([
        import('@jsquash/jpeg/encode'),
        import('@jsquash/jpeg/decode'),
        import('@jsquash/webp/encode'),
        import('@jsquash/webp/decode'),
        import('@jsquash/png/encode'),
        import('@jsquash/png/decode'),
        import('@jsquash/oxipng/optimise'),
        import('@jsquash/resize'),
      ])

    await Promise.all([
      jpegEncode.init(await compiled('jpeg/codec/enc/mozjpeg_enc.wasm')),
      jpegDecode.init(await compiled('jpeg/codec/dec/mozjpeg_dec.wasm')),
      webpEncode.init(await compiled('webp/codec/enc/webp_enc.wasm')),
      webpDecode.init(await compiled('webp/codec/dec/webp_dec.wasm')),
      pngEncode.init(await readFile(codecPath('png/codec/pkg/squoosh_png_bg.wasm'))),
      pngDecode.init(await readFile(codecPath('png/codec/pkg/squoosh_png_bg.wasm'))),
      oxipng.init(await readFile(codecPath('oxipng/codec/pkg/squoosh_oxipng_bg.wasm'))),
      resize.initResize(await readFile(codecPath('resize/lib/resize/pkg/squoosh_resize_bg.wasm'))),
    ])
  })()

  return ready
}

/**
 * O AVIF é inicializado à parte: o `avif_enc.wasm` tem 3,4 MB e compilá-lo
 * custa caro. Só os testes que realmente produzem AVIF pagam esse preço.
 *
 * O decoder entra junto porque a ida-e-volta sem perda do modo converter
 * precisa ler de volta o que acabou de escrever — e em Node não existe
 * `createImageBitmap` para fazer isso pelo caminho nativo.
 */
let avifReady: Promise<void> | null = null

export function initNodeAvif(): Promise<void> {
  avifReady ??= (async () => {
    await initNodeCodecs()
    const [encode, decode] = await Promise.all([
      import('@jsquash/avif/encode'),
      import('@jsquash/avif/decode'),
    ])
    await Promise.all([
      encode.init(await compiled('avif/codec/enc/avif_enc.wasm')),
      decode.init(await compiled('avif/codec/dec/avif_dec.wasm')),
    ])
  })()

  return avifReady
}
