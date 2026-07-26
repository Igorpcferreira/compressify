/**
 * A marca. O símbolo é o do brand board, redesenhado como componente:
 * um colchete de arquivo com a seta de compressão em Signal.
 *
 * O traço de 3,2/32 é proporcional ao viewBox, então a marca escala sem
 * engordar. `currentColor` no colchete deixa o modo escuro funcionar sozinho.
 */

export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M26 6H9V26H26"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="square"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M26 11L19.5 16L26 21"
        stroke="var(--color-signal)"
        strokeWidth="3.4"
        strokeLinecap="square"
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function Logo() {
  return (
    <span className="text-text flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[1.1875rem] leading-none font-bold tracking-[-0.03em]">
        Compressify
      </span>
    </span>
  )
}
