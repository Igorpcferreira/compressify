/**
 * Gera a captura de tela do README.
 *
 * A imagem mostra o produto **em uso**, com resultados reais — não uma tela
 * vazia. Para isso o script comprime fotos de verdade no navegador, com as
 * mesmas fixturas do E2E, e só então fotografa.
 *
 * Existe como script versionado, e não como um comando digitado uma vez, porque
 * a captura envelhece: quando a interface mudar, `node scripts/screenshot.mjs`
 * regenera as duas variantes em vez de alguém tirar um print torto.
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

const server = spawn(process.execPath, ['scripts/serve-out.mjs', String(PORT)], {
  stdio: 'ignore',
})

try {
  mkdirSync(OUT, { recursive: true })
  await delay(1200)

  const browser = await chromium.launch()
  // Alto o bastante para caber a página inteira em uso — cabeçalho, dropzone,
  // preferências e os cards com resultado — sem virar uma tira comprida.
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1420 },
    deviceScaleFactor: 1.5,
  })

  for (const tema of ['light', 'dark']) {
    await page.goto(BASE)
    await page.evaluate((valor) => {
      document.documentElement.setAttribute('data-theme', valor)
    }, tema)

    await page
      .locator('input[type="file"]:not([webkitdirectory])')
      .setInputFiles(fixtureFiles(3, { width: 1600, height: 1200 }))

    await page.getByRole('button', { name: 'Comprimir tudo' }).click()
    await page
      .getByRole('button', { name: /^Baixar foto-\d+/ })
      .nth(2)
      .waitFor({ timeout: 120_000 })

    // Sem foco visível na captura: o anel de foco no último botão clicado
    // rouba a atenção de quem olha a imagem.
    await page.evaluate(() => {
      const focado = document.activeElement
      if (focado instanceof HTMLElement) focado.blur()
    })
    await page.evaluate(() => {
      window.scrollTo(0, 0)
    })
    await delay(400)

    await page.screenshot({ path: `${OUT}/tela-${tema}.png`, fullPage: false })
    process.stdout.write(`${OUT}/tela-${tema}.png\n`)
  }

  await browser.close()
} finally {
  server.kill()
}
