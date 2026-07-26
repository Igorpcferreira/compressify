/**
 * O selo de privacidade.
 *
 * Não é enfeite: é a afirmação central do produto, e o `PLANO.md` §1.5 a torna
 * estrutural — o deploy é estático e não existe function para onde enviar nada.
 * O selo diz em texto o que a arquitetura garante.
 *
 * O cadeado usa o traço 1,7px do board. No claro, texto em Signal Deep sobre
 * tinta de Signal; no escuro, Signal puro sobre Ink (9,95:1) — os dois pares
 * medidos em docs/brand/DESVIOS.md.
 */

function LockIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="1.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function PrivacyBadge() {
  return (
    <span className="bg-signal/10 border-signal-deep/22 text-signal-deep dark:border-signal/30 dark:text-signal inline-flex h-seal items-center gap-2.5 rounded-pill border px-3.5">
      <LockIcon />
      <span className="text-caption font-semibold">
        Processado no seu navegador · Nada é enviado
      </span>
    </span>
  )
}
