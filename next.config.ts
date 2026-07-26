import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
