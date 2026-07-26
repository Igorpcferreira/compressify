/**
 * `sitemap.xml`, gerado na build.
 *
 * Com `output: 'export'` o Next escreve o arquivo estático — não há rota
 * dinâmica servindo isto. As datas são fixas em vez de `new Date()`: um sitemap
 * cujo `lastModified` muda a cada build ensina o buscador a ignorar o campo.
 */

import type { MetadataRoute } from 'next'
import { canonical } from '@/lib/site'

const LAST_MODIFIED = new Date('2026-07-26')

export const dynamic = 'force-static'

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
  ]
}
