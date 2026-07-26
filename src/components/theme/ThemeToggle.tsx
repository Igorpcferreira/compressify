/**
 * O alternador de tema da barra superior.
 *
 * A fonte da verdade é o atributo `data-theme` do `<html>`, não um estado do
 * React: o `ThemeScript` já o resolveu antes da primeira pintura, e ter duas
 * fontes produziria exatamente o flash que aquele script existe para evitar.
 *
 * Ler DOM em `useEffect` + `setState` funcionaria, mas é uma renderização em
 * cascata a cada montagem. `useSyncExternalStore` é a ferramenta certa para
 * "valor que mora fora do React": o `getServerSnapshot` devolve `null`, então a
 * pré-renderização estática sai com um rótulo neutro e a hidratação não
 * diverge — e o `MutationObserver` mantém o botão certo mesmo se o tema for
 * trocado por outro lugar.
 */

'use client'

import { Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/Button'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'compressify-tema'

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  return () => {
    observer.disconnect()
  }
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

function getServerSnapshot(): Theme | null {
  return null
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribe, getSnapshot, getServerSnapshot)

  function toggle(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)

    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Navegação privada com armazenamento bloqueado: o tema vale só nesta aba.
    }
  }

  const label = theme === 'dark' ? 'Modo claro' : 'Modo escuro'

  return (
    <Button
      size="sm"
      onClick={toggle}
      aria-label={theme === null ? 'Alternar tema' : label}
      title={label}
    >
      {theme === 'dark' ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
      <span className="hidden sm:inline">{theme === null ? 'Tema' : label}</span>
    </Button>
  )
}
