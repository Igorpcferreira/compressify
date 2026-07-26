/**
 * A grade de links entre as conversões.
 *
 * Não é enfeite de rodapé: é o que impede as doze landings de nascerem órfãs.
 * Uma página que só existe no `sitemap.xml` e não é apontada por nenhum link do
 * próprio site é rastreada de má vontade e some — o sitemap declara a
 * existência, o link interno é o que dá razão para visitar.
 *
 * Componente de servidor: sai como HTML no documento, sem custar um byte de
 * JavaScript. São `<a>` comuns em vez de `next/link` pela mesma razão que o
 * resto do cabeçalho — a exportação é estática e não há prefetch para ganhar.
 */

import { CONVERSION_PAIRS } from '@/lib/conversions'

export interface ConversionLinksProps {
  /** O par da página atual, que não se linka a si mesma. */
  current?: string
}

export function ConversionLinks({ current }: ConversionLinksProps) {
  const pairs = CONVERSION_PAIRS.filter((pair) => pair.slug !== current)

  return (
    <section
      aria-labelledby="conversoes"
      className="border-border flex flex-col gap-5 border-t pt-10"
    >
      <div className="flex flex-col gap-2">
        <h2 id="conversoes" className="text-h2 font-display">
          Todas as conversões
        </h2>
        <p className="text-text-muted text-small max-w-prose text-pretty">
          Cada par tem sua página, e todas usam a mesma ferramenta desta aqui — o formato de destino
          já vem escolhido.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {pairs.map((pair) => (
          <li key={pair.slug}>
            <a
              href={`/${pair.slug}/`}
              className="text-small text-text-muted hover:text-text font-mono transition-colors"
            >
              {pair.from.label} <span aria-hidden>→</span> <span className="sr-only">para</span>
              {pair.to.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
