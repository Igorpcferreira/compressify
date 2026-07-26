/**
 * O critério de aceite #1, #4, #5 e #6 do brief, num teste só por navegador.
 *
 * Este arquivo é a primeira vez em todo o projeto que uma imagem de verdade é
 * comprimida dentro de um navegador de verdade. Os 309 testes de unidade rodam
 * em Node com os codecs injetados ou reais, mas nenhum deles prova que o
 * `Worker`, o `createImageBitmap` e o `.wasm` funcionam juntos sob Chrome,
 * Firefox e WebKit. É o que roda aqui.
 */

import { expect, test } from '@playwright/test'
import { fixtureFiles } from './fixtures'

const FILE_INPUT = 'input[type="file"]:not([webkitdirectory])'

test.describe('fila de compressão', () => {
  test('comprime um lote e mostra o ganho de cada arquivo', async ({ page }) => {
    await page.goto('/')

    await page.locator(FILE_INPUT).setInputFiles(fixtureFiles(3))

    const cards = page.getByRole('listitem')
    await expect(cards).toHaveCount(3)
    // `exact` porque o resumo convive com uma região `aria-live` que diz
    // "0 de 3 arquivos concluídos" — as duas contêm "3 arquivos".
    await expect(page.getByText('3 arquivos', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Comprimir tudo' }).click()

    // Sem `.toHaveCount` aqui: o que importa é cada card ter chegado ao fim,
    // com o badge de economia — que só existe quando há resultado.
    await expect(page.getByRole('button', { name: /^Baixar foto-\d+/ })).toHaveCount(3, {
      timeout: 90_000,
    })

    const badges = page.locator('li').getByText(/^−\d+%$/)
    await expect(badges).toHaveCount(3)

    // A promessa do produto: o arquivo sai menor. O `−` é o menos tipográfico
    // do design system (U+2212), não um hífen.
    for (const text of await badges.allTextContents()) {
      expect(Number(text.replace('−', '').replace('%', ''))).toBeGreaterThan(0)
    }
  })

  test('mostra progresso individual sem travar a aba', async ({ page }) => {
    await page.goto('/')
    await page.locator(FILE_INPUT).setInputFiles(fixtureFiles(4, { width: 1400, height: 1050 }))

    await page.getByRole('button', { name: 'Comprimir tudo' }).click()

    // A aba responde enquanto os workers trabalham: se os pixels estivessem na
    // thread principal, esta interação ficaria presa até o fim do lote.
    await expect(page.getByRole('progressbar').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancelar tudo' })).toBeVisible()

    const responsive = await page.evaluate(() => {
      const started = performance.now()
      return new Promise<number>((resolve) => {
        requestAnimationFrame(() => resolve(performance.now() - started))
      })
    })
    expect(responsive).toBeLessThan(2000)

    await expect(page.getByRole('button', { name: /^Baixar foto-\d+/ })).toHaveCount(4, {
      timeout: 90_000,
    })
  })

  test('cancela a fila no meio', async ({ page }) => {
    await page.goto('/')
    await page.locator(FILE_INPUT).setInputFiles(fixtureFiles(6, { width: 1600, height: 1200 }))

    await page.getByRole('button', { name: 'Comprimir tudo' }).click()
    await expect(page.getByRole('button', { name: 'Cancelar tudo' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancelar tudo' }).click()

    // Volta a ser possível comprimir: a fila parou de verdade, não ficou presa
    // num estado intermediário.
    await expect(page.getByRole('button', { name: 'Comprimir tudo' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('cancelado', { exact: false }).first()).toBeVisible()
  })

  test('baixa o lote inteiro num ZIP', async ({ page }) => {
    await page.goto('/')
    await page.locator(FILE_INPUT).setInputFiles(fixtureFiles(2))

    await page.getByRole('button', { name: 'Comprimir tudo' }).click()
    await expect(page.getByRole('button', { name: /^Baixar foto-\d+/ })).toHaveCount(2, {
      timeout: 90_000,
    })

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Baixar tudo (.zip)' }).click()
    const zip = await download

    expect(zip.suggestedFilename()).toMatch(/^compressify-\d{8}-\d{4}\.zip$/)

    const stream = await zip.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const bytes = Buffer.concat(chunks)

    // Assinatura local do formato ZIP. Vale mais que "o arquivo existe".
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    expect(bytes.length).toBeGreaterThan(1000)
  })

  test('baixa um arquivo sozinho com o nome de saída', async ({ page }) => {
    await page.goto('/')
    await page.locator(FILE_INPUT).setInputFiles(fixtureFiles(1))

    await page.getByRole('button', { name: 'Comprimir tudo' }).click()
    const baixar = page.getByRole('button', { name: /^Baixar foto-1/ })
    await expect(baixar).toBeVisible({ timeout: 90_000 })

    const download = page.waitForEvent('download')
    await baixar.click()

    expect((await download).suggestedFilename()).toBe('foto-1-compressify.webp')
  })

  test('recusa o que não sabe processar, com motivo', async ({ page }) => {
    await page.goto('/')

    await page
      .locator(FILE_INPUT)
      .setInputFiles([
        { name: 'scan.tif', mimeType: 'image/tiff', buffer: Buffer.from([0x49, 0x49, 0x2a, 0x00]) },
      ])

    // O Next injeta um `role="alert"` próprio (o anunciador de rota), então o
    // seletor filtra pelo nosso.
    await expect(
      page.getByRole('alert').filter({ hasText: /não entr(ou|aram) na fila/ }),
    ).toContainText('não decodificam TIFF')

    // A fila nem aparece — e não vale contar `listitem`: o próprio aviso lista
    // os arquivos recusados numa `<ul>`.
    await expect(page.getByRole('region', { name: 'Fila de arquivos' })).toHaveCount(0)
  })

  test('converte para o formato escolhido', async ({ page }) => {
    await page.goto('/converter-avif/')
    await page.locator(FILE_INPUT).setInputFiles(fixtureFiles(1, { width: 400, height: 300 }))

    await page.getByRole('radio', { name: 'AVIF' }).click()
    await page.getByRole('button', { name: 'Comprimir tudo' }).click()

    const baixar = page.getByRole('button', { name: /^Baixar foto-1/ })
    await expect(baixar).toBeVisible({ timeout: 90_000 })

    const download = page.waitForEvent('download')
    await baixar.click()
    expect((await download).suggestedFilename()).toBe('foto-1-compressify.avif')
  })
})
