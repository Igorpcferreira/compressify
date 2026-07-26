/**
 * Constantes do site.
 *
 * A URL canônica vive aqui porque três lugares precisam concordar: o
 * `metadataBase` do layout, o `sitemap.ts` e o JSON-LD das landings. Divergir
 * entre eles produz canônico apontando para o lugar errado, que é o tipo de
 * erro de SEO que ninguém percebe até a página sumir da busca.
 *
 * `NEXT_PUBLIC_SITE_URL` permite apontar para o domínio real no deploy sem
 * recompilar mentalmente: o padrão é o da Vercel.
 */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://compressify.vercel.app'
).replace(/\/$/, '')

export const SITE_NAME = 'Compressify'

export function canonical(path: string): string {
  const normalized = path === '/' ? '/' : `/${path.replace(/^\/|\/$/g, '')}/`
  return `${SITE_URL}${normalized}`
}
