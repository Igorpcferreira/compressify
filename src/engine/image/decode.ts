/**
 * Decodificação híbrida: nativa primeiro, WASM de fallback.
 *
 * A decisão está em docs/PLANO.md §3.2, e o spike (docs/SPIKE.md §2) corrigiu
 * o motivo pelo qual ela vale a pena. Não é velocidade no Chromium — lá o
 * ganho vai de 1,0× a 2,8× e, em JPEG de 12MP, o decoder WASM chegou a ser
 * mais rápido. Vale por três outras razões:
 *
 * 1. **Firefox:** 2,9–6,9× mais rápido no nativo, e é onde sobra menos margem.
 * 2. **Bundle:** tira ~1,5 MB de WASM do caminho crítico, que é o que sustenta
 *    a meta de Lighthouse ≥ 90.
 * 3. **EXIF:** `imageOrientation: 'from-image'` resolve orientação em todos os
 *    formatos. Sem isso, toda foto de celular sai deitada — o `.rotate()` do
 *    Sharp é requisito de fidelidade com o app desktop.
 *
 * O decode roda **uma vez por job**; o `ImageEngine` reaproveita o resultado
 * em todas as tentativas de encode. É isso que faz o modo meta ficar mais
 * rápido que o app desktop, que re-decodifica até 56 vezes (docs/SPIKE.md §6).
 */

import type { ImageFormat } from '@/engine/core/types'

/**
 * A moeda de pixels do motor: RGBA de 8 bits, sem premultiplicação.
 *
 * Deliberadamente mais frouxo que o `ImageData` do DOM — assim o motor inteiro
 * é testável em Node, onde o construtor de `ImageData` não existe. Um
 * `ImageData` real satisfaz este contrato.
 */
export interface RgbaImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type DecodeSource = 'native' | 'wasm'

export interface DecodeResult {
  image: RgbaImage
  /** Qual caminho produziu o resultado. Diagnóstico e testes. */
  source: DecodeSource
}

export interface DecodeOptions {
  /** Formato dos bytes mágicos (`probe.ts`); escolhe o decoder do fallback. */
  format: ImageFormat | null
  /**
   * Pula o caminho nativo. Usado por PNG de 16 bits, que o canvas rebaixaria
   * para 8 — ver `decodeImage`.
   */
  preferWasm?: boolean
}

/** Falha de decodificação com mensagem apresentável ao usuário. */
export class DecodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DecodeError'
  }
}

function hasNativeDecode(): boolean {
  return typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function'
}

/**
 * Caminho nativo. Roda dentro do worker: `OffscreenCanvas` existe lá, o
 * `<canvas>` do DOM não.
 *
 * `colorSpace: 'srgb'` fixa o espaço na leitura de volta; sem isso o readback
 * passa pelo gerenciamento de cor do navegador e imagens wide-gamut variam
 * entre máquinas. O Sharp já descarta o perfil ICC por padrão, então o app
 * desktop tem o mesmo desvio — não é regressão.
 */
async function decodeNative(blob: Blob): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })

  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d', {
      colorSpace: 'srgb',
      willReadFrequently: true,
    })

    if (!context) {
      throw new DecodeError('O navegador não forneceu um contexto 2D para decodificar.')
    }

    context.drawImage(bitmap, 0, 0)
    return context.getImageData(0, 0, bitmap.width, bitmap.height)
  } finally {
    // Liberar o bitmap imediatamente: a 24MP são ~96 MB que não podem esperar
    // o coletor de lixo enquanto oito workers disputam memória.
    bitmap.close()
  }
}

/**
 * Fallback WASM. Cada decoder é carregado sob demanda — nenhum deles entra no
 * bundle inicial.
 */
async function decodeWithWasm(buffer: ArrayBuffer, format: ImageFormat): Promise<RgbaImage> {
  switch (format) {
    case 'jpeg': {
      const { default: decode } = await import('@jsquash/jpeg/decode')
      // O padrão do pacote é `preserveOrientation: false`, ou seja, ele
      // aplica a orientação EXIF — o mesmo que `from-image` faz no nativo.
      return await decode(buffer)
    }
    case 'png': {
      const { default: decode } = await import('@jsquash/png/decode')
      return await decode(buffer)
    }
    case 'webp': {
      const { default: decode } = await import('@jsquash/webp/decode')
      return await decode(buffer)
    }
    case 'avif': {
      const { default: decode } = await import('@jsquash/avif/decode')
      const image = await decode(buffer)
      if (!image) throw new DecodeError('Não foi possível decodificar o AVIF de entrada.')
      return image
    }
  }
}

/**
 * Decodifica para RGBA de 8 bits.
 *
 * Sobre `preferWasm` em PNG de 16 bits: o plano dizia que o fallback WASM
 * "preserva" a profundidade. **Preserva no decoder, não no pipeline** — resize,
 * quantização e todos os encoders operam em 8 bits, então os 16 bits morrem no
 * passo seguinte de qualquer jeito. O roteamento continua valendo, mas por
 * outro motivo: evita a conversão de espaço de cor e o ida-e-volta de alfa
 * premultiplicado do canvas justamente nas imagens onde o banding aparece
 * primeiro. Levar 16 bits de ponta a ponta é assunto de outra fase, e só faria
 * sentido com saída PNG de 16 bits.
 */
export async function decodeImage(blob: Blob, options: DecodeOptions): Promise<DecodeResult> {
  const useNative = !options.preferWasm && hasNativeDecode()

  if (useNative) {
    try {
      return { image: await decodeNative(blob), source: 'native' }
    } catch (error) {
      // Formato que o navegador não conhece, arquivo corrompido ou memória
      // insuficiente. O WASM ainda pode dar conta; se não der, o erro dele é
      // que chega ao usuário.
      if (!options.format) {
        throw new DecodeError('Não foi possível decodificar a imagem.', { cause: error })
      }
    }
  }

  if (!options.format) {
    throw new DecodeError('Formato de imagem não reconhecido.')
  }

  try {
    const buffer = await blob.arrayBuffer()
    return { image: await decodeWithWasm(buffer, options.format), source: 'wasm' }
  } catch (error) {
    if (error instanceof DecodeError) throw error
    throw new DecodeError('Não foi possível decodificar a imagem.', { cause: error })
  }
}
