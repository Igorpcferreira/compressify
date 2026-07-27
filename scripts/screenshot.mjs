/**
 * Gera as capturas de tela do README.
 *
 * As imagens mostram o produto **em uso**, com resultados reais — não uma tela
 * vazia. Para isso o script comprime fotos de verdade no navegador, com as
 * mesmas fixturas do E2E, e só então fotografa.
 *
 * São quatro: a tela larga em claro e escuro, e o celular em claro e escuro.
 * As do celular saem emolduradas num aparelho, com fundo transparente.
 *
 * Existe como script versionado, e não como um comando digitado uma vez, porque
 * a captura envelhece: quando a interface mudar, `node scripts/screenshot.mjs`
 * regenera as quatro variantes em vez de alguém tirar um print torto.
 *
 * Uso:
 *   npm run build && node scripts/screenshot.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import { fixtureFiles } from '../tests/e2e/fixtures.ts'

const PORT = 4788
const BASE = `http://127.0.0.1:${PORT}`
const OUT = 'docs/imagens'
const TEMAS = ['light', 'dark']

/**
 * Abre a home no tema pedido, comprime `quantos` arquivos e espera o lote
 * terminar. Devolve com a página parada e sem foco visível: o anel de foco no
 * último botão clicado rouba a atenção de quem olha a imagem.
 */
async function processaUmLote(page, tema, quantos) {
  await page.goto(BASE)
  await page.evaluate((valor) => {
    document.documentElement.setAttribute('data-theme', valor)
  }, tema)

  await page
    .locator('input[type="file"]:not([webkitdirectory])')
    .setInputFiles(fixtureFiles(quantos, { width: 1600, height: 1200 }))

  await page.getByRole('button', { name: 'Comprimir tudo' }).click()
  await page
    .getByRole('button', { name: /^Baixar foto-\d+/ })
    .nth(quantos - 1)
    .waitFor({ timeout: 120_000 })

  await page.evaluate(() => {
    const focado = document.activeElement
    if (focado instanceof HTMLElement) focado.blur()
  })
}

/**
 * As duas cores de fundo do app, iguais às do `themeColor` do layout. A barra
 * de status da moldura usa a mesma tinta da página, senão ela aparece como uma
 * faixa colada por cima em vez de fazer parte da tela.
 */
const PELE = {
  light: { fundo: '#F7F8F5', tinta: '#0B0D0C' },
  dark: { fundo: '#0B0D0C', tinta: '#FFFFFF' },
}

/**
 * A moldura do aparelho, desenhada em CSS pelo próprio navegador.
 *
 * Não é um PNG de celular guardado no repositório: assim ela acompanha a
 * captura sem ninguém alinhar bordas à mão, e o fundo sai **transparente** —
 * é o que faz a mesma imagem funcionar no README claro e no escuro do GitHub.
 *
 * A barra de status é decoração, e é a única coisa aqui que não veio do
 * produto: sem ela a captura começa no meio da página e o corte no topo parece
 * defeito. O relógio é fixo para a imagem não mudar a cada regeneração.
 */
function moldura(base64, tema) {
  const { fundo, tinta } = PELE[tema]

  return `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: transparent; }
  /* A folga existe para a sombra caber dentro do recorte do elemento. */
  .palco { width: fit-content; padding: 40px 44px 56px; }

  .aparelho {
    position: relative;
    padding: 11px;
    border-radius: 56px;
    background: linear-gradient(150deg, #56565c, #1e1e22 26%, #101013 62%, #3c3c44);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, .55), 0 34px 56px -26px rgba(0, 0, 0, .55);
  }
  /* O fio claro por dentro da borda: sem ele a moldura preta some no README escuro. */
  .aparelho::after {
    content: '';
    position: absolute;
    inset: 5px;
    border-radius: 51px;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .16);
  }

  .vidro { width: 390px; overflow: hidden; border-radius: 45px; background: ${fundo}; }
  .tela { display: block; width: 390px; }

  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 30px 8px;
    color: ${tinta};
    font: 600 15px/1 -apple-system, Segoe UI, Roboto, sans-serif;
  }
  .status .sinal { display: flex; align-items: flex-end; gap: 2px; }
  .status .sinal i { width: 3px; background: currentColor; border-radius: 1px; }

  .botao {
    position: absolute;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: linear-gradient(90deg, #0c0c0f, #4a4a52);
  }
  .botao[data-lado="direito"] {
    border-radius: 3px 0 0 3px;
    background: linear-gradient(270deg, #0c0c0f, #4a4a52);
  }
</style>
<div class="palco">
  <div class="aparelho">
    <span class="botao" style="left: -3px; top: 116px; height: 28px"></span>
    <span class="botao" style="left: -3px; top: 172px; height: 56px"></span>
    <span class="botao" style="left: -3px; top: 244px; height: 56px"></span>
    <span class="botao" data-lado="direito" style="right: -3px; top: 198px; height: 92px"></span>

    <div class="vidro">
      <div class="status">
        <span>09:41</span>
        <span style="display: flex; align-items: center; gap: 7px">
          <span class="sinal">
            <i style="height: 4px"></i><i style="height: 6px"></i>
            <i style="height: 8px"></i><i style="height: 10px"></i>
          </span>
          <svg width="15" height="11" viewBox="0 0 15 11" fill="none" aria-hidden>
            <path d="M1 3.4a9.4 9.4 0 0 1 13 0M3.6 6a5.9 5.9 0 0 1 7.8 0" stroke="currentColor"
              stroke-width="1.6" stroke-linecap="round"/>
            <circle cx="7.5" cy="9" r="1.4" fill="currentColor"/>
          </svg>
          <svg width="24" height="12" viewBox="0 0 24 12" fill="none" aria-hidden>
            <rect x=".7" y=".7" width="20" height="10.6" rx="3.2" stroke="currentColor"
              stroke-opacity=".45" stroke-width="1.2"/>
            <rect x="2.4" y="2.4" width="14" height="7.2" rx="1.9" fill="currentColor"/>
            <path d="M22.4 4.3v3.4a1.9 1.9 0 0 0 0-3.4Z" fill="currentColor" fill-opacity=".45"/>
          </svg>
        </span>
      </div>
      <img class="tela" src="data:image/png;base64,${base64}">
    </div>
  </div>
</div>`
}

const server = spawn(process.execPath, ['scripts/serve-out.mjs', String(PORT)], {
  stdio: 'ignore',
})

try {
  mkdirSync(OUT, { recursive: true })
  await delay(1200)

  const browser = await chromium.launch()

  // Alto o bastante para caber a página inteira em uso — cabeçalho, dropzone,
  // preferências e os cards com resultado — sem virar uma tira comprida.
  const larga = await browser.newPage({
    viewport: { width: 1280, height: 1420 },
    deviceScaleFactor: 1.5,
  })

  for (const tema of TEMAS) {
    await processaUmLote(larga, tema, 3)
    await larga.evaluate(() => {
      window.scrollTo(0, 0)
    })
    await delay(400)

    await larga.screenshot({ path: `${OUT}/tela-${tema}.png`, fullPage: false })
    process.stdout.write(`${OUT}/tela-${tema}.png\n`)
  }

  await larga.close()

  // 390 × 844 é o retrato de celular mais comum; os 34 px descontados da altura
  // são os que a barra de status da moldura devolve. A captura sai em 2×, e a
  // moldura renderiza em 1,5× — a tela é reduzida em vez de esticada, que é o
  // lado certo de errar quando o alvo é um PNG de README.
  const celular = await browser.newPage({
    viewport: { width: 390, height: 810 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const emolduramento = await browser.newPage({
    viewport: { width: 640, height: 1100 },
    deviceScaleFactor: 1.5,
  })

  for (const tema of TEMAS) {
    await processaUmLote(celular, tema, 2)

    // No celular a página não cabe numa tela só, então a foto é da parte que
    // interessa: o resumo do lote, as saídas e os arquivos prontos.
    const resumo = celular.getByText(/arquivos · .* concluídos/).first()
    const topo = await resumo.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
    // Os 18 px de folga acima do resumo são calculados para o card de
    // preferências, logo acima dele, sair inteiro do enquadramento: uma borda
    // solta encostada na barra de status lê como defeito da moldura.
    await celular.evaluate((y) => {
      window.scrollTo(0, y)
    }, topo - 18)
    await delay(400)

    const tela = await celular.screenshot()

    await emolduramento.setContent(moldura(tela.toString('base64'), tema))
    await emolduramento.locator('.tela').evaluate((img) => img.decode())
    await emolduramento.locator('.palco').screenshot({
      path: `${OUT}/celular-${tema}.png`,
      omitBackground: true,
    })
    process.stdout.write(`${OUT}/celular-${tema}.png\n`)
  }

  await browser.close()
} finally {
  server.kill()
}
