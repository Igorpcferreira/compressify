/**
 * A imagem de compartilhamento, gerada na build.
 *
 * `ImageResponse` roda no momento do build (`dynamic = 'force-static'`), então
 * a exportação estática sai com o PNG pronto — nenhuma function no deploy, que
 * é a regra que sustenta a promessa de privacidade.
 *
 * As fontes são as do sistema do gerador, não as da marca: embutir Bricolage
 * Grotesque aqui exigiria carregar o arquivo `.ttf` no build, e o ganho não
 * paga o custo numa imagem que aparece a 1200×630 num cartão de rede social. O
 * que precisa ser reconhecível — o símbolo, o verde Signal, o fundo Ink — é
 * desenhado com formas.
 */

import { ImageResponse } from 'next/og'

export const alt = 'Compressify — comprima qualquer imagem, sem upload'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const dynamic = 'force-static'

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#0B0D0C',
        padding: 80,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <svg width="72" height="72" viewBox="0 0 32 32" fill="none">
          <path d="M26 6H9V26H26" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="square" />
          <path
            d="M26 11L19.5 16L26 21"
            stroke="#00D47E"
            strokeWidth="3.4"
            strokeLinecap="square"
          />
        </svg>
        <span style={{ fontSize: 56, fontWeight: 700, color: '#FFFFFF', letterSpacing: -2 }}>
          Compressify
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <span
          style={{
            fontSize: 82,
            fontWeight: 700,
            color: '#FFFFFF',
            lineHeight: 1.05,
            letterSpacing: -3,
          }}
        >
          Comprima qualquer imagem.
        </span>
        <span style={{ fontSize: 82, fontWeight: 700, color: '#00D47E', letterSpacing: -3 }}>
          Sem upload.
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(0, 212, 126, 0.12)',
            border: '1px solid rgba(0, 212, 126, 0.35)',
            borderRadius: 999,
            padding: '14px 28px',
            fontSize: 26,
            color: '#00D47E',
          }}
        >
          Processado no seu navegador · Nada é enviado
        </span>
        <span style={{ fontSize: 26, color: '#6B716D' }}>JPG · PNG · WEBP · AVIF</span>
      </div>
    </div>,
    size,
  )
}
