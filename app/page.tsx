/**
 * A home.
 *
 * Server component de propósito: cabeçalho, herói e rodapé saem no HTML
 * estático, e só a `QueueWorkspace` carrega JavaScript. As landings por
 * ferramenta (`/comprimir-imagem`, `/converter-webp`) são do Incremento 7.
 */

import { Logo } from '@/components/brand/Logo'
import { PrivacyBadge } from '@/components/brand/PrivacyBadge'
import { QueueWorkspace } from '@/components/queue/QueueWorkspace'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6">
      <header className="border-border flex h-17 items-center justify-between border-b">
        <Logo />
        <nav aria-label="Ferramentas" className="flex items-center gap-6">
          <span className="text-small text-text hidden font-medium sm:inline">Imagens</span>
          <span className="text-small text-text-muted hidden sm:inline" aria-disabled>
            PDF
          </span>
          <span className="text-small text-text-muted hidden sm:inline" aria-disabled>
            Vídeo
          </span>
          <ThemeToggle />
        </nav>
      </header>

      <main className="flex flex-1 flex-col gap-8 py-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <PrivacyBadge />

          <h1 className="font-display text-h1 text-balance sm:text-[2.75rem] sm:leading-[1.05]">
            Comprima qualquer imagem.
            <br />
            Sem upload.
          </h1>

          <p className="text-text-muted max-w-prose text-pretty">
            Em massa, sem limite, sem cadastro e sem marca d’água. Os arquivos são processados
            dentro do seu navegador e nunca saem do seu computador.
          </p>
        </div>

        <QueueWorkspace />
      </main>

      <footer className="border-border text-caption text-text-muted flex flex-wrap items-center justify-between gap-3 border-t py-7">
        <span>Compressify · processamento 100% local</span>
        <span className="font-mono">JPG · PNG · WEBP · AVIF</span>
      </footer>
    </div>
  )
}
