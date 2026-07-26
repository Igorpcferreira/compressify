/**
 * Os pares "X para Y" — o catálogo que gera as landings e alimenta o seletor.
 *
 * Módulo folha: importa só o tipo `ImageFormat`. Ele é lido pela rota estática
 * (que roda na build), pelo sitemap, pelo componente de links e pela barra de
 * conversão, e nenhum deles pode arrastar o motor ou a store por tabela.
 *
 * **Por que gerar em vez de escrever doze arquivos.** Doze páginas escritas à
 * mão divergiriam na primeira correção — foi o mesmo argumento que fez as
 * quatro landings existentes compartilharem um `ToolPage`. O risco do outro
 * lado é conteúdo repetido, que buscador trata como página-porta e ignora com
 * razão; por isso o texto de cada par **não é um molde com o nome trocado**: o
 * que muda de par para par é o que o formato de destino faz com os pixels, e
 * isso é diferente de verdade em cada combinação (§5.3 do
 * docs/HANDOFF-CONVERSAO.md).
 */

import type { ImageFormat } from '@/engine/core/types'
import type { FaqItem } from '@/components/landing/ToolPage'

/**
 * Como o formato se comporta quanto a perda.
 *
 * - `nenhuma`: o formato é sem perda por definição (PNG).
 * - `sempre`: não existe modo sem perda (JPEG).
 * - `opcional`: tem os dois modos, e nós usamos o sem perda ao converter
 *   (WebP e AVIF — medido em `tests/integration/convert-lossless.test.ts`).
 */
export type LossProfile = 'nenhuma' | 'sempre' | 'opcional'

export interface FormatInfo {
  id: ImageFormat
  /** O que vai na URL: o que as pessoas digitam, não o nome oficial. */
  slug: string
  label: string
  loss: LossProfile
  /** Uma frase sobre para que o formato serve. Entra no texto das landings. */
  summary: string
}

export const FORMATS: readonly FormatInfo[] = [
  {
    id: 'jpeg',
    slug: 'jpg',
    label: 'JPG',
    loss: 'sempre',
    summary: 'o formato universal de fotografia, aceito em qualquer lugar',
  },
  {
    id: 'png',
    slug: 'png',
    label: 'PNG',
    loss: 'nenhuma',
    summary: 'sem perda e com transparência, o formato de captura de tela e arte com traço',
  },
  {
    id: 'webp',
    slug: 'webp',
    label: 'WebP',
    loss: 'opcional',
    summary: 'o formato da web moderna: menor que o JPG na mesma qualidade, e com transparência',
  },
  {
    id: 'avif',
    slug: 'avif',
    label: 'AVIF',
    loss: 'opcional',
    summary: 'o mais eficiente dos quatro, com o encode mais caro',
  },
] as const

export function formatById(id: ImageFormat): FormatInfo {
  const found = FORMATS.find((format) => format.id === id)
  // Inalcançável: `FORMATS` cobre os quatro membros de `ImageFormat`.
  if (!found) throw new Error(`Formato desconhecido: ${id}`)
  return found
}

export function formatBySlug(slug: string): FormatInfo | undefined {
  return FORMATS.find((format) => format.slug === slug)
}

export interface ConversionPair {
  /** `jpg-para-webp` — o caminho da landing, sem barras. */
  slug: string
  from: FormatInfo
  to: FormatInfo
}

/**
 * Os doze pares: quatro formatos, cada um para os outros três.
 *
 * Converter um formato para ele mesmo não é conversão — o modo automático já
 * recomprime `original` para quem quer isso.
 */
export const CONVERSION_PAIRS: readonly ConversionPair[] = FORMATS.flatMap((from) =>
  FORMATS.filter((to) => to.id !== from.id).map((to) => ({
    slug: `${from.slug}-para-${to.slug}`,
    from,
    to,
  })),
)

export function pairBySlug(slug: string): ConversionPair | undefined {
  return CONVERSION_PAIRS.find((pair) => pair.slug === slug)
}

/**
 * O destino sai sem perda? Vale para PNG (por definição), WebP e AVIF (porque o
 * modo converter pede lossless nos dois). JPEG nunca.
 */
export function isLosslessTarget(pair: ConversionPair): boolean {
  return pair.to.loss !== 'sempre'
}

/**
 * O arquivo tende a crescer na conversão sem perda?
 *
 * A regra óbvia — "guardar sem perda algo que já perdeu informação custa
 * bytes" — explica três quartos dos casos. O quarto veio de medição e
 * contraria a intuição de que "AVIF é o mais eficiente":
 *
 * | Origem 800×600 | PNG    | WebP sem perda | AVIF sem perda |
 * | -------------- | ------ | -------------- | -------------- |
 * | foto           | 728 KB | 516 KB (−29%)  | 1058 KB (+45%) |
 * | arte chapada   | 1 KB   | 0,3 KB (−78%)  | 5 KB (+515%)   |
 *
 * O modo sem perda do AVIF não foi feito para competir com o PNG; a eficiência
 * do AVIF está no modo com perda, que é o modo Auto. Já o WebP sem perda ganha
 * do PNG nas duas famílias de imagem.
 *
 * "Tende" é a palavra certa e não hesitação: um `.webp` pode ter sido gravado
 * sem perda, e aí o PNG não cresce. O formato do arquivo não diz qual dos dois
 * é, então prometer o número seria inventar.
 */
export function tendsToGrow(pair: ConversionPair): boolean {
  // Qualidade máxima ainda é com perda: sai menor que qualquer origem sem perda.
  if (pair.to.id === 'jpeg') return false
  if (pair.to.id === 'webp') return pair.from.id !== 'png'
  return true
}

/**
 * Por que cresce, em uma frase — ou `null` quando não cresce.
 *
 * São dois motivos diferentes, e trocá-los seria mentir: converter um JPG para
 * PNG cresce porque o JPG jogou informação fora; converter um PNG para AVIF
 * cresce porque o lossless do AVIF é ruim, não porque o PNG perdeu algo.
 */
export function growthReason(pair: ConversionPair): string | null {
  if (!tendsToGrow(pair)) return null

  if (pair.from.loss === 'nenhuma') {
    return `o modo sem perda do ${pair.to.label} não foi feito para competir com o ${pair.from.label} — numa foto de 800×600 medida aqui ele saiu 45% maior. A eficiência do ${pair.to.label} está no modo com perda, que é o modo Auto`
  }

  return `o ${pair.to.label} guarda exatamente o que recebe, e o ${pair.from.label} já tinha jogado informação fora para ficar pequeno`
}

export interface PairCopy {
  title: string
  /** Vai no `<title>`, no JSON-LD e no `aria-label` da seção da ferramenta. */
  plainTitle: string
  description: string
  faq: readonly FaqItem[]
}

/** A frase de destaque que aparece acima da ferramenta, na landing do par. */
export function pairHighlight(pair: ConversionPair): string {
  if (!isLosslessTarget(pair)) {
    return 'JPG não tem modo sem perda — nenhum arquivo JPG tem. A conversão sai na qualidade máxima, que é o mais fiel que o formato permite.'
  }

  const semPerda = 'A conversão é sem perda: os pixels que entram são os que saem, byte a byte.'
  const razao = growthReason(pair)

  return razao
    ? `${semPerda} Em compensação o arquivo costuma ficar maior, porque ${razao}.`
    : semPerda
}

/** O texto de cada par, montado a partir do que os formatos de fato fazem. */
export function pairCopy(pair: ConversionPair): PairCopy {
  const { from, to } = pair
  const plainTitle = `Converter ${from.label} para ${to.label}`

  const description = isLosslessTarget(pair)
    ? `Converta ${from.label} para ${to.label} em massa, direto no navegador e sem perda nenhuma — ${to.summary}. Nenhum arquivo é enviado para servidor algum.`
    : `Converta ${from.label} para ${to.label} em massa, direto no navegador — ${to.summary}. JPG não tem modo sem perda, então a saída sai na qualidade máxima. Nenhum arquivo é enviado para servidor algum.`

  const razao = growthReason(pair)

  const faq: FaqItem[] = [
    {
      question: `A conversão de ${from.label} para ${to.label} perde qualidade?`,
      answer: isLosslessTarget(pair)
        ? `Não, no modo Converter. O ${to.label} guarda a imagem sem perda nenhuma, então os pixels do arquivo original chegam intactos do outro lado — há um teste no repositório que converte, converte de volta e compara pixel a pixel. Nos modos Auto e Meta a conversão comprime, que é outra escolha e está anunciada como tal.`
        : `Alguma coisa sim, e não há como não perder: o JPG não tem modo sem perda, nenhum arquivo JPG tem. A ferramenta usa a qualidade máxima do formato, que é o mais fiel possível. Se o objetivo é não perder nada, o destino precisa ser PNG ou WebP.`,
    },
    {
      question: razao
        ? `Por que o ${to.label} fica maior que o ${from.label}?`
        : `O arquivo fica menor?`,
      answer: razao
        ? `Porque ${razao}. É o comportamento correto de uma conversão sem perda, não um defeito — e se o que você quer é economizar espaço, o caminho é o modo Auto ou a Meta de tamanho, não o Converter.`
        : from.id === 'png' && to.id === 'webp'
          ? `Costuma ficar, mesmo sem perder um pixel: o WebP sem perda comprime melhor que o PNG. Numa medição aqui, uma foto de 800×600 foi de 728 KB para 516 KB (−29%) e uma arte chapada caiu 78% — sem tocar em nenhum pixel.`
          : `Fica, e bastante — ${to.summary}. Se você precisa de um tamanho específico, o modo Meta aceita um alvo em MB e busca a qualidade que cabe nele.`,
    },
    {
      question: 'Os arquivos são enviados para algum servidor?',
      answer:
        'Não, e isso não é política de privacidade: é arquitetura. O site é uma exportação estática, não existe função de servidor para onde enviar nada, e há um teste que intercepta toda requisição de rede em três navegadores e falha se qualquer uma levar um byte do seu arquivo.',
    },
    {
      question: 'Dá para converter uma pasta inteira de uma vez?',
      answer:
        'Dá. Arraste a pasta, ou vários arquivos, e converta o lote todo — com progresso por arquivo e cancelamento a qualquer momento. No fim, baixe um a um, tudo num ZIP, ou salve direto numa pasta do disco.',
    },
  ]

  return { title: plainTitle, plainTitle, description, faq }
}
