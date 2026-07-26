/**
 * `ImageEngine` — onde a estratégia encontra os codecs.
 *
 * Este módulo é fino de propósito. Ele não decide *como* comprimir (isso é do
 * `strategy.ts`, que é puro e testado) nem *como* codificar (isso é do
 * `codecs.ts`). Ele coordena: decodifica uma vez, mantém o cache de escala,
 * conta progresso, cuida do orçamento de tempo e monta o `JobResult`.
 *
 * Os codecs entram por injeção (`ImageCodecs`) em vez de import direto. Não é
 * cerimônia: é o que permite testar o motor inteiro em Node, sem WASM e sem
 * canvas, exercitando o caminho que o usuário realmente percorre.
 */

import type {
  CompressionEngine,
  FileMetadata,
  ImageFormat,
  JobContext,
  JobOptions,
  JobResult,
} from '@/engine/core/types'
import { encodeImage, resizeImage } from './codecs'
import { decodeImage, type DecodeOptions, type DecodeResult, type RgbaImage } from './decode'
import {
  SUPPORTED_INPUT_MIME_TYPES,
  isSupportedInput,
  mimeTypeForFormat,
  resolveOutputFormat,
} from './format'
import { buildOutputPath } from './naming'
import { HEADER_SLICE_BYTES, isDeepPng, readImageHeader, type ImageHeader } from './probe'
import {
  AbortedError,
  TARGET_SEARCH_ITERATIONS,
  mbToBytes,
  qualitySteps,
  renderAutomatic,
  renderTargeted,
  type RenderOutcome,
  type Renderer,
} from './strategy'

/**
 * Teto de tempo por job (docs/PLANO.md §2.2.1).
 *
 * Existe por causa do Firefox: lá o pior caso do modo meta numa imagem de 12MP
 * chega a ~305 s (docs/SPIKE.md §6). Sem o teto, a fila trava e o usuário
 * fecha a aba. Ao estourar, o job devolve o melhor resultado obtido até ali
 * com status `warning`.
 */
export const DEFAULT_TIME_BUDGET_MS = 20_000

/** Fatia do progresso reservada ao decode. */
const DECODE_PERCENT = 10
/** Fatia distribuída entre as tentativas de encode. */
const ENCODE_SPAN = 85
/** Trava até o resultado sair: 100% só quando existe blob. */
const PROGRESS_CEILING = 95

export const ENGINE_MESSAGES = {
  largerThanOriginal: 'Arquivo comprimido ficou maior que o original.',
  invalidTarget: 'Meta de tamanho inválida.',
} as const

/** Arquivo que este motor não sabe processar. */
export class UnsupportedInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedInputError'
  }
}

/** A fronteira com o mundo WASM. Trocável nos testes. */
export interface ImageCodecs {
  decode(blob: Blob, options: DecodeOptions): Promise<DecodeResult>
  encode(image: RgbaImage, format: ImageFormat, quality: number): Promise<Uint8Array>
  resize(image: RgbaImage, width: number, height: number): Promise<RgbaImage>
}

export const browserCodecs: ImageCodecs = {
  decode: decodeImage,
  encode: encodeImage,
  resize: resizeImage,
}

export interface ImageEngineOptions {
  codecs?: ImageCodecs
  /** Teto de tempo por job. `Infinity` desliga a guarda. */
  timeBudgetMs?: number
  /**
   * Nomes de saída já usados. A desambiguação por índice é por lote, então
   * quem orquestra o lote injeta o mesmo `Set` em todos os jobs.
   */
  taken?: Set<string>
}

/**
 * Progresso monotônico.
 *
 * Duas regras vêm de docs/PLANO.md §2.3: o percentual **nunca anda para trás**
 * — mesmo quando a estimativa piora, porque progresso que retrocede lê como
 * bug ainda que seja honesto — e trava em 95% até o resultado existir.
 */
class ProgressReporter {
  private last = 0
  private completed = 0
  private scale = 1

  constructor(
    private readonly emit: (percent: number) => void,
    private estimated: number,
  ) {}

  decoded(): void {
    this.push(DECODE_PERCENT)
  }

  /**
   * Uma tentativa de encode terminou. No modo meta a estimativa é reajustada a
   * cada novo nível de escala: começa em 7 e ganha mais 7 quando a busca
   * desiste da resolução atual.
   */
  attempt(scale: number): void {
    if (scale !== this.scale) {
      this.scale = scale
      this.estimated = this.completed + TARGET_SEARCH_ITERATIONS
    }

    this.completed += 1
    if (this.completed >= this.estimated) {
      this.estimated = this.completed + 1
    }

    this.push(DECODE_PERCENT + ENCODE_SPAN * (this.completed / this.estimated))
  }

  finish(): void {
    this.last = 100
    this.emit(100)
  }

  private push(value: number): void {
    const capped = Math.min(PROGRESS_CEILING, value)
    if (capped <= this.last) return
    this.last = capped
    this.emit(Math.round(capped))
  }
}

function relativePathOf(file: File): string {
  return file.webkitRelativePath || file.name
}

function dimensionsAt(
  width: number,
  height: number,
  scale: number,
): { width: number; height: number } {
  if (scale >= 1) return { width, height }
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}

/** Preserva o `getTargetMb` do app Electron, mas recusa entrada inválida. */
function targetBytesOf(options: JobOptions): number {
  const megabytes = options.preset === 'custom' ? Number(options.customTargetMb) : options.preset

  if (!Number.isFinite(megabytes) || megabytes <= 0) {
    throw new Error(ENGINE_MESSAGES.invalidTarget)
  }

  return mbToBytes(megabytes)
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new AbortedError()
}

/**
 * Um `Uint8Array` genérico não é `BlobPart` para o TypeScript, porque poderia
 * estar sobre um `SharedArrayBuffer`. Quando a view cobre o buffer inteiro —
 * o caso de tudo que sai dos nossos encoders — passamos o próprio buffer e não
 * copiamos nada. Um PNG de 24MP são dezenas de megabytes; a cópia só acontece
 * no caso improvável de uma view parcial.
 */
function toBlobPart(bytes: Uint8Array): BlobPart {
  const { buffer, byteOffset, byteLength } = bytes

  if (buffer instanceof ArrayBuffer && byteOffset === 0 && byteLength === buffer.byteLength) {
    return buffer
  }

  const copy = new ArrayBuffer(byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

export class ImageEngine implements CompressionEngine {
  readonly id = 'image'

  private readonly codecs: ImageCodecs
  private readonly timeBudgetMs: number
  private readonly taken: Set<string>

  constructor(options: ImageEngineOptions = {}) {
    this.codecs = options.codecs ?? browserCodecs
    this.timeBudgetMs = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS
    this.taken = options.taken ?? new Set<string>()
  }

  supports(file: File): boolean {
    return (
      isSupportedInput(file.name) ||
      (SUPPORTED_INPUT_MIME_TYPES as readonly string[]).includes(file.type)
    )
  }

  /**
   * Dimensões e formato sem decodificar, quando o cabeçalho permite.
   *
   * O orçamento de megapixels do pool precisa disto **antes** do despacho;
   * decodificar 50 arquivos só para medir dobraria o trabalho.
   */
  async probe(file: File): Promise<FileMetadata> {
    const header = await this.readHeader(file)

    if (header) {
      return {
        width: header.width,
        height: header.height,
        format: header.format,
        bytes: file.size,
      }
    }

    // Cabeçalho ilegível (arquivo truncado, variante exótica): resta decodificar
    // para medir. Caro, mas raro — e melhor que despachar sem estimativa.
    const { image } = await this.codecs.decode(file, { format: null })
    return { width: image.width, height: image.height, format: null, bytes: file.size }
  }

  async process(file: File, options: JobOptions, ctx: JobContext): Promise<JobResult> {
    if (!this.supports(file)) {
      throw new UnsupportedInputError(`Formato não suportado: ${file.name}`)
    }

    const startedAt = Date.now()
    const isExpired = (): boolean => Date.now() - startedAt >= this.timeBudgetMs

    throwIfAborted(ctx.signal)

    const originalBytes = file.size
    const outputFormat = resolveOutputFormat(file.name, options.outputFormat)
    const targetBytes = options.mode === 'target' ? targetBytesOf(options) : null

    const header = await this.readHeader(file)
    const { image } = await this.codecs.decode(file, {
      format: header?.format ?? null,
      preferWasm: isDeepPng(header),
    })

    throwIfAborted(ctx.signal)

    const { width, height } = image
    const progress = new ProgressReporter(
      (percent) => {
        ctx.onProgress(percent)
      },
      options.mode === 'target' ? TARGET_SEARCH_ITERATIONS : qualitySteps(options.quality).length,
    )
    progress.decoded()

    /**
     * Cache de escala de um slot só.
     *
     * A busca percorre as escalas em ordem decrescente e nunca volta a uma
     * anterior, então guardar apenas a escala corrente já entrega o ganho que
     * importa — 8 resizes no pior caso, não 56 — e libera a escala antiga
     * assim que a próxima nasce. Cada `ImageData` de 12MP são ~48 MB; com oito
     * workers, segurar escalas mortas é como a aba morre.
     */
    let scaled: { scale: number; image: RgbaImage } | null = null

    const imageAt = async (scale: number): Promise<RgbaImage> => {
      if (scale >= 1) return image
      if (scaled?.scale === scale) return scaled.image

      const size = dimensionsAt(width, height, scale)
      // Sempre a partir do original: encadear resizes degrada a qualidade.
      const resized = await this.codecs.resize(image, size.width, size.height)
      scaled = { scale, image: resized }
      return resized
    }

    const render: Renderer = async (attempt) => {
      const source = await imageAt(attempt.scale)
      const bytes = await this.codecs.encode(source, outputFormat, attempt.quality)
      progress.attempt(attempt.scale)
      return bytes
    }

    const strategyContext = { signal: ctx.signal, isExpired }

    const outcome: RenderOutcome =
      targetBytes === null
        ? await renderAutomatic(
            render,
            { requestedQuality: options.quality, originalBytes },
            strategyContext,
          )
        : await renderTargeted(
            render,
            {
              width,
              height,
              originalBytes,
              targetBytes,
              maxQuality: options.quality,
            },
            strategyContext,
          )

    const compressedBytes = outcome.bytes.byteLength
    const savedBytes = originalBytes - compressedBytes
    const savedPercent = originalBytes > 0 ? (savedBytes / originalBytes) * 100 : 0

    // Regra do app Electron preservada: resultado maior que o original é
    // aviso, não sucesso — mesmo quando a estratégia não reclamou.
    const message =
      outcome.warning ?? (savedBytes < 0 ? ENGINE_MESSAGES.largerThanOriginal : undefined)

    const final = dimensionsAt(width, height, outcome.attempt.scale)
    progress.finish()

    return {
      blob: new Blob([toBlobPart(outcome.bytes)], { type: mimeTypeForFormat(outputFormat) }),
      outputName: buildOutputPath(relativePathOf(file), outputFormat, this.taken),
      originalBytes,
      compressedBytes,
      savedBytes,
      savedPercent,
      status: message ? 'warning' : 'success',
      ...(message ? { message } : {}),
      width: final.width,
      height: final.height,
    }
  }

  private async readHeader(file: File): Promise<ImageHeader | null> {
    const slice = await file.slice(0, HEADER_SLICE_BYTES).arrayBuffer()
    return readImageHeader(new Uint8Array(slice))
  }
}
