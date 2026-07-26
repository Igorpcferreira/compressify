/**
 * Quantização de cor para PNG com perda.
 *
 * Substitui o `png({ quality, palette: quality < 88 })` do Sharp, que não tem
 * equivalente na família jSquash. Escrito à mão em vez de usar `image-q`
 * porque a biblioteca custou 13,6 s por imagem de 12MP no Chromium e 32 s no
 * Firefox — inviável para lote (docs/SPIKE.md §5.3).
 *
 * A economia vem da estrutura, não de micro-otimização:
 *
 * 1. O histograma é construído sobre uma **amostra**. A distribuição de cores
 *    de uma foto não muda materialmente com 1/8 dos pixels, e a construção da
 *    paleta é a etapa cara do `image-q`.
 * 2. A aplicação usa uma **LUT de 15 bits** (32.768 entradas) calculada uma
 *    única vez. Cada pixel vira uma consulta de array, em vez de uma busca
 *    pela cor mais próxima na paleta.
 *
 * Sem dithering, como o `palette: true` do Sharp em seu modo padrão.
 *
 * Código puro sobre typed arrays: sem WASM, sem DOM, testável direto.
 */

/** Bits por canal no histograma e na LUT. 5 → 32.768 baldes. */
const BITS = 5
const LEVELS = 1 << BITS // 32
const LUT_SIZE = 1 << (BITS * 3) // 32.768
const SHIFT = 8 - BITS // 3

/** Teto de pixels amostrados na construção do histograma. */
const MAX_SAMPLES = 500_000

/** Abaixo deste alfa o pixel vira totalmente transparente; acima, opaco. */
const ALPHA_THRESHOLD = 128

/**
 * O Sharp aplica paleta quando `quality < 88`. Preservamos o limiar e
 * derivamos o tamanho da paleta da qualidade.
 */
export const PALETTE_QUALITY_THRESHOLD = 88

export function shouldQuantize(quality: number): boolean {
  return quality < PALETTE_QUALITY_THRESHOLD
}

/**
 * Mapeia a qualidade (24–87) para o número de cores da paleta (32–256).
 * Interpolação linear, arredondada para a potência de dois mais próxima por
 * baixo — paletas em potência de dois são as que o PNG indexado codifica
 * com menos bits por pixel.
 */
export function paletteSizeForQuality(quality: number): number {
  const clamped = Math.min(PALETTE_QUALITY_THRESHOLD - 1, Math.max(24, Math.round(quality)))
  const t = (clamped - 24) / (PALETTE_QUALITY_THRESHOLD - 1 - 24)
  const raw = 32 + t * (256 - 32)

  // maior potência de dois <= raw, limitada a [32, 256]
  const power = 2 ** Math.floor(Math.log2(raw))
  return Math.min(256, Math.max(32, power))
}

interface Box {
  /** Índices de baldes do histograma que pertencem a esta caixa. */
  buckets: number[]
  population: number
  /** Extensão do canal mais largo — critério de corte do median cut. */
  widestChannel: 0 | 1 | 2
  widestSpread: number
}

function channelOf(bucket: number, channel: 0 | 1 | 2): number {
  const shift = (2 - channel) * BITS
  return (bucket >> shift) & (LEVELS - 1)
}

function measure(buckets: number[], histogram: Uint32Array): Omit<Box, 'buckets'> {
  let population = 0
  const min: [number, number, number] = [LEVELS, LEVELS, LEVELS]
  const max: [number, number, number] = [-1, -1, -1]

  for (const bucket of buckets) {
    population += histogram[bucket] ?? 0
    for (const channel of [0, 1, 2] as const) {
      const value = channelOf(bucket, channel)
      if (value < min[channel]) min[channel] = value
      if (value > max[channel]) max[channel] = value
    }
  }

  let widestChannel: 0 | 1 | 2 = 0
  let widestSpread = -1
  for (const channel of [0, 1, 2] as const) {
    const spread = max[channel] - min[channel]
    if (spread > widestSpread) {
      widestSpread = spread
      widestChannel = channel
    }
  }

  return { population, widestChannel, widestSpread }
}

/**
 * Median cut: parte repetidamente a caixa de maior população pelo canal de
 * maior extensão, na mediana ponderada, até chegar ao número de cores pedido.
 */
function medianCut(histogram: Uint32Array, occupied: number[], colors: number): Box[] {
  const first: Box = { buckets: occupied, ...measure(occupied, histogram) }
  const boxes: Box[] = [first]

  while (boxes.length < colors) {
    // A caixa mais promissora é a de maior população que ainda dá para partir.
    let targetIndex = -1
    let bestPopulation = 0
    for (let i = 0; i < boxes.length; i += 1) {
      const box = boxes[i]
      if (!box || box.buckets.length < 2 || box.widestSpread <= 0) continue
      if (box.population > bestPopulation) {
        bestPopulation = box.population
        targetIndex = i
      }
    }
    if (targetIndex === -1) break

    const box = boxes[targetIndex]
    if (!box) break

    const channel = box.widestChannel
    const sorted = [...box.buckets].sort((a, b) => channelOf(a, channel) - channelOf(b, channel))

    // Corta na mediana ponderada por população, não no meio da lista: é o que
    // evita paletas dominadas por cores raras.
    const half = box.population / 2
    let accumulated = 0
    let cut = 0
    for (let i = 0; i < sorted.length - 1; i += 1) {
      accumulated += histogram[sorted[i] ?? 0] ?? 0
      if (accumulated >= half) {
        cut = i + 1
        break
      }
    }
    if (cut === 0) cut = Math.max(1, Math.floor(sorted.length / 2))

    const left = sorted.slice(0, cut)
    const right = sorted.slice(cut)
    if (left.length === 0 || right.length === 0) break

    boxes[targetIndex] = { buckets: left, ...measure(left, histogram) }
    boxes.push({ buckets: right, ...measure(right, histogram) })
  }

  return boxes
}

/**
 * Aplica o limiar de alfa: abaixo de 128 o pixel vira totalmente transparente
 * e tem as componentes de cor zeradas; acima, vira totalmente opaco.
 *
 * Zerar a cor dos transparentes não é cosmético: pixels totalmente
 * transparentes com cores variadas inflam o PNG indexado sem nenhum efeito
 * visual.
 */
function normalizeAlpha(data: Uint8ClampedArray, pixelCount: number): void {
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const i = pixel * 4
    if ((data[i + 3] ?? 255) < ALPHA_THRESHOLD) {
      data[i] = 0
      data[i + 1] = 0
      data[i + 2] = 0
      data[i + 3] = 0
    } else {
      data[i + 3] = 255
    }
  }
}

export interface QuantizeResult {
  /** Os mesmos dados, com as cores reduzidas à paleta. Mutação in-place. */
  data: Uint8ClampedArray
  /** Cores efetivamente usadas — pode ser menor que o pedido. */
  paletteSize: number
}

export interface QuantizeOptions {
  /** Número máximo de cores. Use `paletteSizeForQuality` para derivar da qualidade. */
  colors: number
}

/**
 * Reduz a imagem a no máximo `colors` cores, in-place.
 *
 * O alfa é resolvido por limiar: abaixo de 128 vira totalmente transparente,
 * acima vira totalmente opaco. É o que o PNG indexado representa sem um canal
 * alfa completo, e evita que o resultado fique maior que o original.
 */
export function quantize(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: QuantizeOptions,
): QuantizeResult {
  const pixelCount = width * height
  const colors = Math.min(256, Math.max(2, Math.floor(options.colors)))

  // --- 1. histograma sobre amostra ---
  const histogram = new Uint32Array(LUT_SIZE)
  const step = Math.max(1, Math.floor(pixelCount / MAX_SAMPLES))

  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const i = pixel * 4
    if ((data[i + 3] ?? 255) < ALPHA_THRESHOLD) continue
    const bucket =
      (((data[i] ?? 0) >> SHIFT) << (BITS * 2)) |
      (((data[i + 1] ?? 0) >> SHIFT) << BITS) |
      ((data[i + 2] ?? 0) >> SHIFT)
    histogram[bucket] = (histogram[bucket] ?? 0) + 1
  }

  const occupied: number[] = []
  for (let bucket = 0; bucket < LUT_SIZE; bucket += 1) {
    if ((histogram[bucket] ?? 0) > 0) occupied.push(bucket)
  }

  // Imagem já dentro do orçamento de cores (ou totalmente transparente): não
  // há o que remapear. Mas o alfa ainda precisa ser resolvido por limiar — é
  // parte do contrato da função, não um efeito colateral da quantização.
  if (occupied.length === 0 || occupied.length <= colors) {
    normalizeAlpha(data, pixelCount)
    return { data, paletteSize: occupied.length }
  }

  // --- 2. median cut ---
  const boxes = medianCut(histogram, occupied, colors)

  // --- 3. cores da paleta: média ponderada por população dentro de cada caixa ---
  const paletteR = new Uint8Array(boxes.length)
  const paletteG = new Uint8Array(boxes.length)
  const paletteB = new Uint8Array(boxes.length)

  for (let b = 0; b < boxes.length; b += 1) {
    const box = boxes[b]
    if (!box) continue
    let sumR = 0
    let sumG = 0
    let sumB = 0
    let total = 0
    for (const bucket of box.buckets) {
      const weight = histogram[bucket] ?? 0
      // Centro do balde: +0,5 nível, reconvertido para 0–255.
      sumR += ((channelOf(bucket, 0) << SHIFT) + (1 << (SHIFT - 1))) * weight
      sumG += ((channelOf(bucket, 1) << SHIFT) + (1 << (SHIFT - 1))) * weight
      sumB += ((channelOf(bucket, 2) << SHIFT) + (1 << (SHIFT - 1))) * weight
      total += weight
    }
    if (total === 0) continue
    paletteR[b] = Math.min(255, Math.round(sumR / total))
    paletteG[b] = Math.min(255, Math.round(sumG / total))
    paletteB[b] = Math.min(255, Math.round(sumB / total))
  }

  // --- 4. LUT: cada balde aponta para a cor de paleta mais próxima ---
  // Os baldes das próprias caixas são resolvidos direto; os vazios (que podem
  // aparecer porque a amostragem não viu aquela cor) recebem busca completa.
  const lut = new Uint8Array(LUT_SIZE)
  const lutFilled = new Uint8Array(LUT_SIZE)

  for (let b = 0; b < boxes.length; b += 1) {
    const box = boxes[b]
    if (!box) continue
    for (const bucket of box.buckets) {
      lut[bucket] = b
      lutFilled[bucket] = 1
    }
  }

  const nearest = (r: number, g: number, bl: number): number => {
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let b = 0; b < boxes.length; b += 1) {
      const dr = r - (paletteR[b] ?? 0)
      const dg = g - (paletteG[b] ?? 0)
      const db = bl - (paletteB[b] ?? 0)
      // Distância ponderada por luminância — erro percebido, não euclidiano cru.
      const distance = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = b
      }
    }
    return bestIndex
  }

  // --- 5. aplicação: uma consulta por pixel ---
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const i = pixel * 4

    if ((data[i + 3] ?? 255) < ALPHA_THRESHOLD) {
      data[i] = 0
      data[i + 1] = 0
      data[i + 2] = 0
      data[i + 3] = 0
      continue
    }
    data[i + 3] = 255

    const bucket =
      (((data[i] ?? 0) >> SHIFT) << (BITS * 2)) |
      (((data[i + 1] ?? 0) >> SHIFT) << BITS) |
      ((data[i + 2] ?? 0) >> SHIFT)

    let index = lut[bucket] ?? 0
    if (!lutFilled[bucket]) {
      index = nearest(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)
      lut[bucket] = index
      lutFilled[bucket] = 1
    }

    data[i] = paletteR[index] ?? 0
    data[i + 1] = paletteG[index] ?? 0
    data[i + 2] = paletteB[index] ?? 0
  }

  return { data, paletteSize: boxes.length }
}
