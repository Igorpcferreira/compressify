/**
 * As doze landings "X para Y", geradas na build.
 *
 * Uma rota dinâmica na raiz convive com as estáticas (`/comprimir-imagem`,
 * `/converter-webp`, `/converter-avif`) porque segmento literal ganha de
 * segmento dinâmico no roteador do Next. Com `dynamicParams = false` e
 * `output: 'export'`, o que sai da build são exatamente os doze diretórios de
 * `generateStaticParams` — nenhuma rota curinga chega ao deploy, e um endereço
 * inventado cai no 404 estático.
 *
 * Todas reusam `ToolPage` e `StructuredData`. A máquina de SEO é a mesma das
 * landings escritas à mão; o que muda é que o texto vem do catálogo de
 * `lib/conversions.ts`, calculado a partir do que cada formato faz com os
 * pixels.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ConversionLinks } from '@/components/landing/ConversionLinks'
import { StructuredData } from '@/components/landing/StructuredData'
import { ToolPage } from '@/components/landing/ToolPage'
import { CONVERSION_PAIRS, pairBySlug, pairCopy, pairHighlight } from '@/lib/conversions'
import { canonical } from '@/lib/site'

export const dynamicParams = false

interface PageProps {
  params: Promise<{ conversao: string }>
}

export function generateStaticParams(): Array<{ conversao: string }> {
  return CONVERSION_PAIRS.map((pair) => ({ conversao: pair.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { conversao } = await params
  const pair = pairBySlug(conversao)
  if (!pair) return {}

  const copy = pairCopy(pair)
  const url = canonical(`/${pair.slug}`)

  return {
    title: `${copy.title} online`,
    description: copy.description,
    alternates: { canonical: url },
    keywords: [
      `${pair.from.slug} para ${pair.to.slug}`,
      `converter ${pair.from.slug} em ${pair.to.slug}`,
      `${pair.from.slug} to ${pair.to.slug}`,
    ],
    openGraph: {
      title: `${copy.title} · Compressify`,
      description: copy.description,
      url,
      type: 'website',
      locale: 'pt_BR',
    },
  }
}

export default async function ConversaoPage({ params }: PageProps) {
  const { conversao } = await params
  const pair = pairBySlug(conversao)

  // Inalcançável com `dynamicParams = false`, e mantido porque o tipo de
  // `pairBySlug` admite `undefined`: o alternativo seria uma asserção, que é
  // uma mentira de tipo esperando a próxima refatoração.
  if (!pair) notFound()

  const copy = pairCopy(pair)

  return (
    <>
      <StructuredData
        name={copy.plainTitle}
        description={copy.description}
        url={canonical(`/${pair.slug}`)}
        faq={copy.faq}
      />
      <ToolPage
        title={
          <>
            Converter {pair.from.label} para {pair.to.label}.
            <br />
            Em lote, sem upload.
          </>
        }
        plainTitle={copy.plainTitle}
        description={copy.description}
        highlight={pairHighlight(pair)}
        conversion={{ from: pair.from.id, to: pair.to.id }}
        faq={copy.faq}
      >
        <ConversionLinks current={pair.slug} />
      </ToolPage>
    </>
  )
}
