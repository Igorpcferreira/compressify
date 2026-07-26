/**
 * O app Electron, transcrito.
 *
 * Este arquivo é uma **transcrição literal** do pipeline de compressão de
 * `src/main/index.ts` da tag `v1.0.0-electron` — `renderAutomatic`,
 * `renderTargeted`, `renderBuffer`, `encode`, `canResize`, `uniqueNumbers` e
 * `clampNumber`, na mesma ordem e com os mesmos números. Ele existe para que o
 * critério de aceite #2 do brief seja um **número medido** e não uma leitura
 * comparada de dois códigos.
 *
 * Regras para quem for mexer aqui:
 *
 * 1. **Não "melhore" nada.** Se o original tem uma saída antecipada faltando,
 *    um clamp redundante ou um piso de resolução que erra por um nível, isso é
 *    exatamente o que precisa ser reproduzido — senão a comparação deixa de
 *    comparar o produto antigo.
 * 2. **A única diferença de forma é a entrada.** O original lê de um caminho
 *    (`sharp(inputPath)`); aqui recebe os bytes (`sharp(buffer)`). O libvips
 *    faz o mesmo trabalho nos dois casos, e passar bytes é o que garante que os
 *    dois motores comparados leiam **o mesmo arquivo**.
 * 3. **O `sharp` é `devDependency`, na versão 0.33.5** — a que o
 *    `package-lock.json` da tag resolveu. Comparar com outra versão de libvips
 *    compararia duas coisas ao mesmo tempo.
 *
 * O `sharp` nunca entra no bundle: ele é importado dinamicamente e só por este
 * arquivo, que só é carregado por `tests/integration/electron-parity.test.ts`.
 */

import type sharpModule from 'sharp'
import type { FormatEnum, Metadata, Sharp } from 'sharp'

/**
 * O módulo `sharp` exporta com `export =`, então ele **é** a função — não há
 * `default` no tipo, mesmo que o `import()` dinâmico entregue um namespace com
 * `default` em tempo de execução. Daí o alias e a ponte em `loadSharp`.
 */
export type SharpFn = typeof sharpModule

export type ElectronFormat = Extract<keyof FormatEnum, 'jpeg' | 'png' | 'webp' | 'avif'>

export interface ElectronOutcome {
  bytes: Uint8Array
  warning?: string
  /** Quantos encodes o pipeline do desktop executou — a métrica de custo. */
  encodes: number
}

/** `sharp` é opcional: sem ele a comparação é pulada em vez de falhar. */
export async function loadSharp(): Promise<SharpFn | null> {
  try {
    const mod: unknown = await import('sharp')
    const sharp = (mod as { default?: SharpFn }).default ?? (mod as SharpFn)
    sharp.cache(false) // como no `src/main/index.ts` da tag
    return sharp
  } catch {
    return null
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.map((value) => clampNumber(Math.round(value), 24, 95)))].sort(
    (a, b) => b - a,
  )
}

/**
 * O piso de resolução do desktop, preservado com o defeito.
 *
 * O teste é feito sobre a escala **atual**, antes de multiplicar, então o nível
 * seguinte pode cair para ~756px. Nós corrigimos isso em `strategy.ts`
 * (docs/PLANO.md §3.3); aqui a versão errada é o ponto.
 */
function canResize(metadata: Metadata, currentScale: number): boolean {
  if (!metadata.width || !metadata.height) {
    return false
  }

  return (
    Math.floor(metadata.width * currentScale) > 900 &&
    Math.floor(metadata.height * currentScale) > 900
  )
}

function encode(pipeline: Sharp, format: ElectronFormat, quality: number): Sharp {
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
        force: true,
      })
    default:
      return pipeline.webp({ quality, effort: 5, force: true })
  }
}

async function renderBuffer(
  sharp: SharpFn,
  input: Uint8Array,
  outputFormat: ElectronFormat,
  quality: number,
  metadata?: Metadata,
  scale = 1,
): Promise<Buffer> {
  let pipeline = sharp(input, { failOn: 'none' }).rotate()

  if (metadata && scale < 1 && metadata.width && metadata.height) {
    pipeline = pipeline.resize({
      width: Math.max(1, Math.floor(metadata.width * scale)),
      height: Math.max(1, Math.floor(metadata.height * scale)),
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  return encode(pipeline, outputFormat, clampNumber(quality, 24, 95)).toBuffer()
}

/** `renderAutomatic` do desktop, degrau por degrau. */
export async function electronAutomatic(
  sharp: SharpFn,
  input: Uint8Array,
  outputFormat: ElectronFormat,
  requestedQuality: number,
): Promise<ElectronOutcome> {
  const originalBytes = input.byteLength
  const qualitySteps = uniqueNumbers([requestedQuality, 82, 74, 66, 58, 48, 38])
  let bestBuffer: Buffer | null = null
  let encodes = 0

  for (const quality of qualitySteps) {
    const buffer = await renderBuffer(sharp, input, outputFormat, quality)
    encodes += 1

    if (!bestBuffer || buffer.byteLength < bestBuffer.byteLength) {
      bestBuffer = buffer
    }

    if (buffer.byteLength < originalBytes) {
      return { bytes: new Uint8Array(buffer), encodes }
    }
  }

  return {
    bytes: new Uint8Array(bestBuffer as Buffer),
    warning: 'Não foi possível reduzir mais sem uma compressão agressiva.',
    encodes,
  }
}

/** `renderTargeted` do desktop: busca binária de 7 passos por nível de escala. */
export async function electronTargeted(
  sharp: SharpFn,
  input: Uint8Array,
  outputFormat: ElectronFormat,
  requestedTargetBytes: number,
  maxQuality: number,
): Promise<ElectronOutcome & { width: number; height: number }> {
  const originalBytes = input.byteLength
  const metadata = await sharp(input, { failOn: 'none' }).metadata()

  const effectiveTargetBytes = Math.min(
    requestedTargetBytes,
    Math.max(1024, Math.floor(originalBytes * 0.98)),
  )

  let bestUnderTarget: Buffer | null = null
  let smallestBuffer: Buffer | null = null
  let scale = 1
  let encodes = 0

  for (let scaleAttempt = 0; scaleAttempt < 8; scaleAttempt += 1) {
    let low = 24
    let high = Math.min(maxQuality, 95)

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const quality = Math.floor((low + high) / 2)
      const buffer = await renderBuffer(sharp, input, outputFormat, quality, metadata, scale)
      encodes += 1

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
      return {
        bytes: new Uint8Array(bestUnderTarget),
        encodes,
        ...(await sizeOf(sharp, bestUnderTarget)),
      }
    }

    if (!canResize(metadata, scale)) {
      break
    }

    scale *= 0.84
  }

  const fallback = smallestBuffer as Buffer
  return {
    bytes: new Uint8Array(fallback),
    warning: 'A imagem foi comprimida no limite possível para as opções selecionadas.',
    encodes,
    ...(await sizeOf(sharp, fallback)),
  }
}

async function sizeOf(sharp: SharpFn, bytes: Buffer): Promise<{ width: number; height: number }> {
  const { width, height } = await sharp(bytes).metadata()
  return { width: width ?? 0, height: height ?? 0 }
}

/**
 * As fontes da comparação, produzidas pelo próprio `sharp` a partir dos pixels
 * de `synthPhoto`.
 *
 * Quem gera a entrada não é neutro por acidente: um JPEG escrito pelo libvips é
 * um JPEG comum, e usá-lo evita a suspeita de que a entrada tenha sido feita
 * sob medida para o motor web. Os dois motores recebem **os mesmos bytes**.
 */
export async function sourceFrom(
  sharp: SharpFn,
  pixels: { data: Uint8ClampedArray; width: number; height: number },
  format: 'jpeg' | 'png',
  quality = 92,
): Promise<Uint8Array> {
  const pipeline = sharp(Buffer.from(pixels.data.buffer, 0, pixels.data.byteLength), {
    raw: { width: pixels.width, height: pixels.height, channels: 4 },
  })

  const buffer =
    format === 'jpeg'
      ? await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer()
      : await pipeline.png({ compressionLevel: 9 }).toBuffer()

  return new Uint8Array(buffer)
}
