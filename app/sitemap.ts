/**
 * `sitemap.xml`, gerado na build.
 *
 * Com `output: 'export'` o Next escreve o arquivo estático — não há rota
 * dinâmica servindo isto. As datas são fixas em vez de `new Date()`: um sitemap
 * cujo `lastModified` muda a cada build ensina o buscador a ignorar o campo.
 */

import type { MetadataRoute } from 'next'
import { CONVERSION_PAIRS } from '@/lib/conversions'
import { canonical } from '@/lib/site'

const LAST_MODIFIED = new Date('2026-07-26')

export const dynamic = 'force-static'

/**
 * As doze landings de conversão saem da mesma lista que gera as rotas. Escrever
 * a lista duas vezes seria garantir que uma delas ficasse para trás — e um
 * sitemap que aponta para uma página que não existe mais custa credibilidade
 * com o rastreador.
 */
const PAIRS: MetadataRoute.Sitemap = CONVERSION_PAIRS.map((pair) => ({
  url: canonical(`/${pair.slug}`),
  lastModified: LAST_MODIFIED,
  changeFrequency: 'monthly',
  priority: 0.6,
}))

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: canonical('/'), lastModified: LAST_MODIFIED, changeFrequency: 'monthly', priority: 1 },
    {
      url: canonical('/comprimir-imagem'),
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: canonical('/converter-webp'),
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: canonical('/converter-avif'),
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    ...PAIRS,
  ]
}
