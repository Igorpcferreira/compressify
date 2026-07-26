/**
 * O corpo compartilhado das landings por ferramenta.
 *
 * As três páginas de SEO (`/comprimir-imagem`, `/converter-webp`,
 * `/converter-avif`) e a home são a **mesma ferramenta** com texto diferente.
 * Duplicar o layout seria convidar as quatro a divergirem; o que varia entra
 * por props, e o que é igual — cabeçalho, selo, espaço de trabalho, rodapé —
 * mora aqui.
 *
 * Cada landing chega ao usuário como HTML estático completo: o `h1`, o texto de
 * apoio e o FAQ estão no documento, não montados por JavaScript. É o que faz a
 * página valer alguma coisa para busca, e é de graça — só a fila é `use client`.
 */

import type { ReactNode } from 'react'
import { Logo } from '@/components/brand/Logo'
import { PrivacyBadge } from '@/components/brand/PrivacyBadge'
import { QueueWorkspace } from '@/components/queue/QueueWorkspace'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

export interface FaqItem {
  question: string
  answer: string
}

export interface ToolPageProps {
  /** Duas linhas: a segunda recebe destaque tipográfico no board. */
  title: ReactNode
  /** Versão em texto puro, para o JSON-LD e para leitores de tela. */
  plainTitle: string
  description: string
  faq?: readonly FaqItem[]
  children?: ReactNode
}

const NAV = [
  { href: '/', label: 'Início' },
  { href: '/comprimir-imagem/', label: 'Comprimir' },
  { href: '/converter-webp/', label: 'WebP' },
  { href: '/converter-avif/', label: 'AVIF' },
]

export function ToolPage({ title, plainTitle, description, faq, children }: ToolPageProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6">
      {/*
        O primeiro elemento focável da página pula direto para a ferramenta.
        Sem ele, quem navega por teclado percorre a barra inteira a cada visita
        — e é um requisito do brief §7, não um enfeite.
      */}
      <a
        href="#ferramenta"
        className="focus:bg-surface-raised focus:border-border focus:text-text sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-button focus:border focus:px-4 focus:py-2"
      >
        Pular para a ferramenta
      </a>

      <header className="border-border flex h-17 items-center justify-between border-b">
        <Logo />
        <nav aria-label="Ferramentas" className="flex items-center gap-5">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-small text-text-muted hover:text-text hidden transition-colors sm:inline"
            >
              {item.label}
            </a>
          ))}
          <ThemeToggle />
        </nav>
      </header>

      <main className="flex flex-1 flex-col gap-8 py-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <PrivacyBadge />

          <h1 className="font-display text-h1 text-balance sm:text-[2.75rem] sm:leading-[1.05]">
            {title}
          </h1>

          <p className="text-text-muted max-w-prose text-pretty">{description}</p>
        </div>

        <section id="ferramenta" aria-label={plainTitle} className="scroll-mt-6">
          <QueueWorkspace />
        </section>

        {children}

        {faq && faq.length > 0 ? (
          <section
            aria-labelledby="perguntas"
            className="border-border flex flex-col gap-6 border-t pt-10"
          >
            <h2 id="perguntas" className="text-h2 font-display">
              Perguntas frequentes
            </h2>

            <dl className="grid gap-6 sm:grid-cols-2">
              {faq.map((item) => (
                <div key={item.question} className="flex flex-col gap-2">
                  <dt className="text-h3">{item.question}</dt>
                  <dd className="text-text-muted text-small text-pretty">{item.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </main>

      <footer className="border-border text-caption text-text-muted flex flex-wrap items-center justify-between gap-3 border-t py-7">
        <span>Compressify · processamento 100% local</span>
        <span className="font-mono">JPG · PNG · WEBP · AVIF</span>
      </footer>
    </div>
  )
}
