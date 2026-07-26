/**
 * JSON-LD das landings.
 *
 * `WebApplication` com `offers` a preço zero é o que descreve honestamente o
 * produto para busca: uma ferramenta gratuita que roda no navegador. O `FAQPage`
 * usa as mesmas perguntas que estão visíveis na página — dado estruturado que
 * não corresponde ao conteúdo é penalizado, e com razão.
 *
 * É o único `<script>` do projeto além do `ThemeScript`, e também não carrega
 * nada de fora: a promessa de "nenhum script de terceiros" continua inteira.
 */

import type { FaqItem } from './ToolPage'

export interface StructuredDataProps {
  name: string
  description: string
  url: string
  faq?: readonly FaqItem[]
}

export function StructuredData({ name, description, url, faq }: StructuredDataProps) {
  const graph: unknown[] = [
    {
      '@type': 'WebApplication',
      name,
      description,
      url,
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Any',
      inLanguage: 'pt-BR',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
      featureList: [
        'Compressão em lote no navegador',
        'Conversão para WebP, AVIF, JPG e PNG',
        'Meta de tamanho em MB',
        'Nenhum arquivo enviado para servidor',
      ],
    },
  ]

  if (faq && faq.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    })
  }

  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })

  return (
    <script
      type="application/ld+json"
      // Conteúdo montado a partir de constantes deste repositório, sem entrada
      // de usuário. O `JSON.stringify` já escapa o que precisa.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
