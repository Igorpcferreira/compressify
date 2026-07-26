import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from 'next/font/google'
import { RegisterServiceWorker } from '@/components/pwa/RegisterServiceWorker'
import { ThemeScript } from '@/components/theme/ThemeScript'
import { SITE_URL } from '@/lib/site'
import './globals.css'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  weight: ['600', '700', '800'],
  variable: '--font-bricolage',
})

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-inter',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains',
})

export const metadata: Metadata = {
  // Sem `metadataBase` o Next resolve as URLs de Open Graph contra localhost e
  // avisa na build. Ele vem de `lib/site.ts`, que é a única fonte da URL
  // canônica — o sitemap e o JSON-LD leem a mesma constante.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Compressify — comprima qualquer imagem, sem upload',
    template: '%s · Compressify',
  },
  description:
    'Comprima e converta imagens em massa direto no navegador. Sem upload, sem limite, sem cadastro e sem marca d’água — seus arquivos nunca saem do seu computador.',
  applicationName: 'Compressify',
  authors: [{ name: 'Igor de Castro' }],
  creator: 'Igor de Castro',
  robots: { index: true, follow: true },
  openGraph: { siteName: 'Compressify', locale: 'pt_BR', type: 'website' },
  twitter: { card: 'summary_large_image' },
  // Sem verificação de propriedade, sem pixel, sem nada de terceiros: a
  // promessa de privacidade vale para o HTML também.
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F8F5' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0D0C' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${bricolage.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
