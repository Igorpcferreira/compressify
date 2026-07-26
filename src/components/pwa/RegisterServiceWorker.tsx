/**
 * Registra o service worker — e só em produção.
 *
 * Em `next dev` o registro seria ativamente nocivo: o service worker
 * interceptaria os chunks do Turbopack e o HMR passaria a servir a versão
 * cacheada, produzindo o bug mais confuso que um desenvolvedor pode encontrar
 * — "eu salvei o arquivo e a tela não muda". O `sw.js` também nem existe no
 * dev: ele é gerado por `scripts/gerar-sw.mjs` a partir do `out/`.
 *
 * Não renderiza nada. Poderia ser um `<script>` inline como o `ThemeScript`,
 * mas ao contrário do tema isto não precisa acontecer antes da primeira
 * pintura — registrar depois é melhor, inclusive, porque não disputa banda com
 * o carregamento inicial que o Lighthouse mede.
 */

'use client'

import { useEffect } from 'react'

export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    const registrar = (): void => {
      // A promessa é ignorada de propósito: falhar em registrar não pode
      // impedir nada. Sem service worker o app continua funcionando — ele só
      // deixa de funcionar sem rede.
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
    }

    // Depois do `load`: o registro dispara o precache do casco inteiro, e
    // fazer isso durante o carregamento inicial competiria com ele.
    if (document.readyState === 'complete') {
      registrar()
      return
    }

    window.addEventListener('load', registrar, { once: true })
    return () => {
      window.removeEventListener('load', registrar)
    }
  }, [])

  return null
}
