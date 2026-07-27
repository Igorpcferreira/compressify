/**
 * Constantes do site.
 *
 * A URL canônica vive aqui porque três lugares precisam concordar: o
 * `metadataBase` do layout, o `sitemap.ts` e o JSON-LD das landings. Divergir
 * entre eles produz canônico apontando para o lugar errado, que é o tipo de
 * erro de SEO que ninguém percebe até a página sumir da busca.
 *
 * `NEXT_PUBLIC_SITE_URL` permite apontar para um domínio próprio no dia em que
 * houver um, sem tocar em código.
 *
 * O padrão é o endereço onde o site **está de fato**. Ele já foi
 * `compressify.vercel.app`, que é outro deploy: enquanto foi, o `og:image`
 * apontava para uma URL que devolvia 404 e todo link compartilhado aparecia sem
 * imagem — e o `canonical` e as 16 URLs do sitemap mandavam a busca para o
 * lugar errado. Um padrão que não é o endereço real não é um padrão, é um bug
 * silencioso.
 */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://compressify-free.vercel.app'
).replace(/\/$/, '')

export const SITE_NAME = 'Compressify'

export function canonical(path: string): string {
  const normalized = path === '/' ? '/' : `/${path.replace(/^\/|\/$/g, '')}/`
  return `${SITE_URL}${normalized}`
}
