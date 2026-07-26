/**
 * Quais arquivos o motor de imagem aceita — e por que recusa o resto.
 *
 * Módulo separado do `engine.ts` por uma razão medida, não estética: a thread
 * principal precisa responder "isto entra na fila?" no instante do drop, e o
 * `ImageEngine` inteiro (estratégia, decode, cache de escala) tem ~13 KB que
 * nunca vão rodar fora do worker. Importar o motor só para chamar `supports()`
 * colocava tudo isso no bundle inicial.
 *
 * O efeito só cresce: na Fase 2, o mesmo import arrastaria o motor de PDF junto.
 *
 * Aqui não há nada além de leitura de nome e de tipo MIME.
 */

import {
  DROPPED_INPUT_EXTENSIONS,
  SUPPORTED_INPUT_MIME_TYPES,
  isDroppedInput,
  isSupportedInput,
} from './format'

export function supportsImage(file: File): boolean {
  return (
    isSupportedInput(file.name) ||
    (SUPPORTED_INPUT_MIME_TYPES as readonly string[]).includes(file.type)
  )
}

/**
 * Por que este arquivo não é aceito — para a UI dizer algo útil em vez de
 * ignorar em silêncio.
 *
 * O TIFF tem mensagem própria: ele era aceito pelo app Electron e sai aqui
 * porque não existe decoder no jSquash e nenhum navegador além do Safari
 * decodifica (docs/PLANO.md §3.5). Quem arrasta um `.tif` merece saber disso,
 * não um "formato não suportado" genérico.
 */
export function imageRejectionReason(file: File): string {
  if (isDroppedInput(file.name)) {
    const extensions = DROPPED_INPUT_EXTENSIONS.join(' e ')
    return `Arquivos ${extensions} não são suportados: os navegadores não decodificam TIFF. Converta para PNG ou JPEG antes.`
  }

  return `Formato não suportado: ${file.name}`
}

/** A política de aceitação que o orquestrador consome: `null` significa aceito. */
export function acceptImage(file: File): string | null {
  return supportsImage(file) ? null : imageRejectionReason(file)
}
