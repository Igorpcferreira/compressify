/**
 * O manifesto do app instalável.
 *
 * Um compressor que roda inteiro no cliente não tem motivo nenhum para exigir
 * conexão depois do primeiro carregamento — é a tese do produto levada às
 * últimas consequências, e o item mais alinhado do roadmap.
 *
 * Os ícones são os mesmos SVG que a aba já usa. Nada de PNG de 192 e 512: SVG é
 * aceito no manifesto pelos navegadores que instalam PWA, escala para qualquer
 * densidade e mantém a regra de não haver binário no repositório. O iOS usa o
 * `apple-icon.svg` pelo caminho dele, que o Next já emite.
 *
 * `id` fixo e `start_url` com a barra final combinam com `trailingSlash: true`
 * do `next.config.ts` — se divergirem, o navegador trata o app instalado como
 * uma origem diferente da aba e a instalação some.
 */

import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Compressify — comprima qualquer imagem, sem upload',
    short_name: 'Compressify',
    description:
      'Comprima e converta imagens em massa direto no navegador. Sem upload, sem limite, sem cadastro — seus arquivos nunca saem do seu computador.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['utilities', 'photo', 'productivity'],
    background_color: '#F7F8F5',
    theme_color: '#F7F8F5',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
