/**
 * Construtores de cabeçalho de imagem para os testes.
 *
 * Bytes montados à mão em vez de arquivos binários no repositório: o que está
 * sob teste é a leitura do cabeçalho, e um construtor explícito deixa visível
 * qual campo cada teste está exercitando. Nenhum destes buffers é uma imagem
 * decodificável — eles têm exatamente o cabeçalho e nada mais.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0))
}

function uint32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function uint16be(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff]
}

export interface PngOptions {
  width: number
  height: number
  /** 8 é o comum; 16 é o que roteia o decode para o WASM. */
  bitDepth?: number
  colorType?: number
}

export function pngHeader({ width, height, bitDepth = 8, colorType = 6 }: PngOptions): Uint8Array {
  return new Uint8Array([
    ...PNG_SIGNATURE,
    ...uint32be(13), // tamanho do IHDR
    ...ascii('IHDR'),
    ...uint32be(width),
    ...uint32be(height),
    bitDepth,
    colorType,
    0, // compressão
    0, // filtro
    0, // entrelaçamento
    ...uint32be(0), // CRC de mentira: nada aqui valida CRC
  ])
}

export interface JpegOptions {
  width: number
  height: number
  precision?: number
  /** Bytes de APP1 antes do SOF, simulando um bloco EXIF. */
  exifBytes?: number
  /** Marcador do quadro: 0xc0 (baseline) ou 0xc2 (progressivo). */
  marker?: number
}

export function jpegHeader({
  width,
  height,
  precision = 8,
  exifBytes = 0,
  marker = 0xc0,
}: JpegOptions): Uint8Array {
  const app1 =
    exifBytes > 0
      ? [0xff, 0xe1, ...uint16be(exifBytes + 2), ...new Array<number>(exifBytes).fill(0)]
      : []

  return new Uint8Array([
    0xff,
    0xd8, // SOI
    0xff,
    0xdb, // DQT, um segmento qualquer antes do quadro
    ...uint16be(4),
    0,
    0,
    ...app1,
    0xff,
    marker,
    ...uint16be(17), // 8 + 3 componentes × 3 bytes
    precision,
    ...uint16be(height),
    ...uint16be(width),
    3, // componentes
    1,
    0x11,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ])
}

function riff(chunk: string, payload: number[]): Uint8Array {
  return new Uint8Array([
    ...ascii('RIFF'),
    ...uint32be(0), // tamanho: irrelevante para a leitura do cabeçalho
    ...ascii('WEBP'),
    ...ascii(chunk),
    ...uint32be(payload.length),
    ...payload,
  ])
}

/** WebP com perda: dimensões em 14 bits dentro do quadro-chave VP8. */
export function webpLossyHeader({ width, height }: { width: number; height: number }): Uint8Array {
  return riff('VP8 ', [
    0x00,
    0x00,
    0x00, // frame tag
    0x9d,
    0x01,
    0x2a, // sync code
    width & 0xff,
    (width >> 8) & 0x3f,
    height & 0xff,
    (height >> 8) & 0x3f,
  ])
}

/** WebP sem perda: largura e altura menos um, empacotadas em 14 bits cada. */
export function webpLosslessHeader({
  width,
  height,
}: {
  width: number
  height: number
}): Uint8Array {
  const packed = (width - 1) | ((height - 1) << 14)
  return riff('VP8L', [
    0x2f,
    packed & 0xff,
    (packed >>> 8) & 0xff,
    (packed >>> 16) & 0xff,
    (packed >>> 24) & 0xff,
  ])
}

/** WebP estendido: o que arquivos com alfa ou animação usam. */
export function webpExtendedHeader({
  width,
  height,
}: {
  width: number
  height: number
}): Uint8Array {
  const w = width - 1
  const h = height - 1
  return riff('VP8X', [
    0x10, // flags
    0,
    0,
    0, // reservado
    w & 0xff,
    (w >> 8) & 0xff,
    (w >> 16) & 0xff,
    h & 0xff,
    (h >> 8) & 0xff,
    (h >> 16) & 0xff,
  ])
}

function ispeBox(width: number, height: number): number[] {
  return [
    ...uint32be(20),
    ...ascii('ispe'),
    ...uint32be(0), // versão e flags
    ...uint32be(width),
    ...uint32be(height),
  ]
}

/**
 * AVIF mínimo: um `ftyp` de marca avif e uma ou mais caixas `ispe`.
 *
 * `extraSizes` simula miniaturas e itens auxiliares, que é o caso em que a
 * heurística de "maior área vence" precisa funcionar.
 */
export function avifHeader({
  width,
  height,
  extraSizes = [],
}: {
  width: number
  height: number
  extraSizes?: Array<{ width: number; height: number }>
}): Uint8Array {
  const boxes = [
    ...extraSizes.flatMap((size) => ispeBox(size.width, size.height)),
    ...ispeBox(width, height),
  ]

  return new Uint8Array([
    ...uint32be(20),
    ...ascii('ftyp'),
    ...ascii('avif'),
    ...uint32be(0), // versão menor
    ...ascii('mif1'),
    ...uint32be(boxes.length + 8),
    ...ascii('meta'),
    ...boxes,
  ])
}

/**
 * Um `File` com o cabeçalho pedido, preenchido até `bytes`.
 *
 * O preenchimento existe porque `file.size` é o "tamanho original" que a
 * estratégia compara com o resultado.
 */
export function imageFile(options: {
  name: string
  header?: Uint8Array
  bytes?: number
  type?: string
  relativePath?: string
}): File {
  const header = options.header ?? new Uint8Array(0)
  const total = Math.max(header.length, options.bytes ?? header.length)
  const content = new Uint8Array(total)
  content.set(header)

  const file = new File([content], options.name, {
    ...(options.type ? { type: options.type } : {}),
  })

  if (options.relativePath) {
    // `webkitRelativePath` é somente-leitura e só é preenchido pelo navegador
    // ao selecionar uma pasta; nos testes ela é definida à mão.
    Object.defineProperty(file, 'webkitRelativePath', { value: options.relativePath })
  }

  return file
}

/**
 * Imagem sintética com entropia de fotografia — a mesma ideia do harness do
 * spike (docs/SPIKE.md §1): gradiente de céu, brilho radial, bandas de terreno
 * e ruído de alta frequência.
 *
 * Uma imagem lisa comprimiria a quase nada e faria os testes de meta de
 * tamanho passarem sem exercitar a busca. O LCG tem semente fixa, então os
 * bytes são idênticos a cada execução.
 */
export function synthPhoto(width: number, height: number, seed = 1): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  let state = seed >>> 0
  const random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0xffffffff
  }

  const centerX = width / 2
  const centerY = height / 3

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const vertical = y / height
      const distance = Math.hypot(x - centerX, y - centerY) / Math.hypot(width, height)
      const glow = Math.max(0, 1 - distance * 2) ** 2
      const band = vertical > 0.6 ? Math.sin(y * 0.4) * 18 : 0
      const noise = (random() - 0.5) * 40

      data[i] = 120 + vertical * 60 + glow * 110 + band + noise
      data[i + 1] = 140 + vertical * 40 + glow * 90 + band * 0.5 + noise
      data[i + 2] = 190 - vertical * 90 + glow * 60 + noise
      data[i + 3] = 255
    }
  }

  return { data, width, height } as unknown as ImageData
}
