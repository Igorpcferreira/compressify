import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'

/**
 * Nota sobre o bundler, porque ela não cabe no `package.json`:
 *
 * `npm run dev` usa Turbopack (padrão do Next 16) e `npm run build` usa
 * **webpack**, via `--webpack`. Não é preferência: o build de produção do
 * Turbopack **trava** — 0% de CPU, indefinidamente — ao empacotar os pacotes
 * do jSquash que trazem variante multi-thread (`@jsquash/oxipng`, com
 * `pkg-parallel` do wasm-bindgen-rayon, e `@jsquash/avif`, com os pthreads do
 * emscripten). Os demais codecs compilam normalmente nos dois bundlers.
 *
 * O diagnóstico completo, com a tabela de qual pacote trava e qual não trava,
 * está em docs/HANDOFF.md §4. Revisitar quando o Turbopack tratar workers
 * aninhados criados por `new Worker(new URL(…), { type: 'module' })`.
 */
const nextConfig: NextConfig = {
  // Sem isto o Turbopack infere a raiz do workspace como C:\Users\user, por
  // causa do package-lock.json que existe lá — o repositório com raiz na home
  // descrito em docs/PLANO.md §9.1. Fixar a raiz mantém a varredura de módulos
  // dentro do projeto.
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },

  // Exportação estática: o deploy não contém nenhuma serverless function.
  // A promessa "nada é enviado" passa a ser estrutural, não apenas verificável
  // na aba Network — não existe endpoint para onde enviar. Ver docs/PLANO.md §1.5.
  output: 'export',

  // Sem otimização de imagem no servidor: `output: 'export'` não a suporta e
  // o produto não deve depender de compute nenhum.
  images: { unoptimized: true },

  // Gera /rota/index.html em vez de /rota.html — URLs limpas na CDN.
  trailingSlash: true,

  reactStrictMode: true,

  // O Next 16 removeu a integração de ESLint no build; o lint roda via
  // `npm run check` e no CI, não durante `next build`.
  typescript: { ignoreBuildErrors: false },
}

export default nextConfig
