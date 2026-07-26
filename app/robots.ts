/**
 * `robots.txt`, gerado na build.
 *
 * Tudo liberado: não há área privada, não há parâmetro de busca que gere
 * páginas duplicadas, e o produto inteiro roda no cliente.
 */

import type { MetadataRoute } from 'next'
import { canonical } from '@/lib/site'

export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${canonical('/')}sitemap.xml`,
  }
}
