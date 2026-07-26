/**
 * As landings "X para Y", num navegador de verdade.
 *
 * O que só dá para afirmar aqui: que a página gerada na build chega ao usuário
 * com o par já escolhido — o que envolve HTML estático, hidratação, efeito de
 * montagem e store, nessa ordem — e que quem chega com o formato "errado" não é
 * recusado. Essa segunda parte é a regra explícita do docs/HANDOFF-CONVERSAO.md
 * §6, e é a que seria fácil quebrar sem ninguém notar.
 */

import { expect, type Page, test } from '@playwright/test'
import { fixtureFiles } from './fixtures'

const FILE_INPUT = 'input[type="file"]:not([webkitdirectory])'

/** O sinal de hidratação do próprio produto — ver `preferencias.spec.ts`. */
async function aguardarHidratacao(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: /^Modo (claro|escuro)$/ })).toBeVisible()
}

test.describe('landings de conversão', () => {
  test('a página já chega com o par escolhido', async ({ page }) => {
    await page.goto('/png-para-avif/')
    await aguardarHidratacao(page)

    // O modo e o formato saem da landing, não do padrão da ferramenta.
    await expect(page.getByRole('radio', { name: 'Converter sem comprimir' })).toHaveAttribute(
      'aria-checked',
      'true',
      { timeout: 10_000 },
    )
    await expect(page.getByRole('radio', { name: 'AVIF' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByLabel('Formato de origem')).toHaveValue('png')
    await expect(page.getByLabel('Formato de destino')).toHaveValue('avif')

    // O aviso de produto: este par sem perda produz arquivo maior, e a página
    // diz por quê antes de a pessoa converter e se assustar.
    await expect(page.getByText(/não foi feito para competir/).first()).toBeVisible()
  })

  test('converte a partir da landing, e o arquivo baixado é do formato prometido', async ({
    page,
  }) => {
    await page.goto('/png-para-webp/')
    await aguardarHidratacao(page)

    await page.locator(FILE_INPUT).setInputFiles(fixtureFiles(1, { width: 240, height: 180 }))

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Converter tudo' }).click()

    const baixar = page.getByRole('button', { name: /^Baixar foto-1/ })
    await expect(baixar).toBeVisible({ timeout: 90_000 })
    await baixar.click()

    const arquivo = await download
    expect(arquivo.suggestedFilename()).toBe('foto-1-compressify.webp')

    const stream = await arquivo.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const bytes = Buffer.concat(chunks)

    // `VP8L` é o WebP sem perda. A landing promete "sem perda nenhuma": o
    // cabeçalho é o que transforma a promessa em fato verificável.
    expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP')
    expect(bytes.subarray(12, 16).toString('latin1')).toBe('VP8L')
  })

  test('quem chega com outro formato é avisado, não recusado', async ({ page }) => {
    // A armadilha do §6: o seletor de origem filtra a exibição, não o motor.
    await page.goto('/jpg-para-webp/')
    await aguardarHidratacao(page)

    await page.locator(FILE_INPUT).setInputFiles(fixtureFiles(2, { width: 200, height: 150 }))

    // Os dois PNGs entraram na fila, apesar de a página ser de JPG.
    const fila = page.getByRole('region', { name: 'Fila de arquivos' })
    await expect(fila.getByRole('listitem')).toHaveCount(2)
    await expect(page.getByText('2 arquivos da fila não são JPG', { exact: false })).toBeVisible()

    // E convertem normalmente: o aviso é informação, não bloqueio.
    await page.getByRole('button', { name: 'Converter tudo' }).click()
    await expect(page.getByRole('button', { name: /^Baixar foto-\d+/ })).toHaveCount(2, {
      timeout: 90_000,
    })
  })

  test('as doze conversões estão no sitemap e se linkam entre si', async ({ page, request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text()

    for (const slug of [
      'jpg-para-webp',
      'jpg-para-png',
      'jpg-para-avif',
      'png-para-jpg',
      'png-para-webp',
      'png-para-avif',
      'webp-para-jpg',
      'webp-para-png',
      'webp-para-avif',
      'avif-para-jpg',
      'avif-para-png',
      'avif-para-webp',
    ]) {
      expect(sitemap).toContain(`/${slug}/`)
    }

    // Página no sitemap e sem link de dentro do site é página órfã: declarada,
    // não visitada. A home aponta para as doze.
    await page.goto('/')
    const grade = page.getByRole('region', { name: 'Todas as conversões' })
    await expect(grade.getByRole('link')).toHaveCount(12)

    await grade.getByRole('link', { name: 'JPG para AVIF' }).click()
    await expect(page).toHaveURL(/\/jpg-para-avif\/$/)
    await expect(page.locator('h1')).toContainText('Converter JPG para AVIF')
  })
})
