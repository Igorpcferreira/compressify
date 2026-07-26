/**
 * O app funciona sem rede — inclusive comprimindo.
 *
 * É a tese do produto levada ao fim: um compressor que roda inteiro no cliente
 * não tem motivo nenhum para exigir conexão depois do primeiro carregamento.
 * Afirmar isso sem medir seria a mesma coisa que afirmar que nada é enviado
 * sem o `privacy.spec.ts`.
 *
 * O teste importante é o terceiro: **comprimir offline**. Abrir a página sem
 * rede prova que o casco está cacheado; comprimir sem rede prova que os
 * `.wasm` — que de propósito não estão no precache — foram para o cache de
 * runtime quando foram usados. É a política de cache inteira, verificada de
 * ponta a ponta.
 *
 * ### A limitação no WebKit, e o que ela não significa
 *
 * `context.setOffline(true)` seguido de `reload()` derruba o driver do WebKit
 * com "WebKit encountered an internal error", **antes** de a navegação chegar
 * ao service worker. É limitação do harness, não do produto: no mesmo WebKit, o
 * primeiro teste passa — o service worker instala, precacheia e assume o
 * controle da página.
 *
 * Os dois testes que dependem de navegar offline são pulados lá, com esta nota
 * no lugar de um `expect` que mentiria. O que fica sem medição no Safari é a
 * navegação sem rede; o que está medido é que o cache existe e está populado.
 */

import { expect, type Page, test } from '@playwright/test'
import { fixtureFiles } from './fixtures'

const FILE_INPUT = 'input[type="file"]:not([webkitdirectory])'

/** O service worker instalado e no controle da página. */
async function servidorPronto(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, {
    timeout: 30_000,
  })
}

test.describe('uso offline', () => {
  test('o service worker assume o controle da página', async ({ page }) => {
    await page.goto('/')
    await servidorPronto(page)

    const casco = await page.evaluate(async () => {
      const chaves = await caches.keys()
      const nome = chaves.find((chave) => chave.startsWith('compressify-casco-'))
      if (!nome) return null

      const cache = await caches.open(nome)
      return (await cache.keys()).length
    })

    expect(casco).toBeGreaterThan(0)
  })

  test('a página abre sem rede', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'setOffline + reload derruba o driver do WebKit')
    await page.goto('/')
    await servidorPronto(page)

    await context.setOffline(true)
    await page.reload()

    await expect(page.locator('h1')).toContainText('Comprima qualquer imagem')
    await expect(page.getByText('Arraste seus arquivos')).toBeVisible()

    await context.setOffline(false)
  })

  test('comprime sem rede depois de ter comprimido uma vez com rede', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', 'setOffline + reload derruba o driver do WebKit')
    await page.goto('/')
    await servidorPronto(page)

    // Primeira compressão com rede: é ela que puxa os `.wasm` e os deixa no
    // cache de runtime. Sem esta etapa o teste seguinte não teria como passar,
    // e é justamente esse o desenho — os 9,7 MB de codec não são baixados por
    // quem só abriu a página.
    await page.locator(FILE_INPUT).setInputFiles(fixtureFiles(1))
    await page.getByRole('button', { name: 'Comprimir tudo' }).click()
    await expect(page.getByRole('button', { name: /^Baixar foto-\d+/ })).toHaveCount(1, {
      timeout: 90_000,
    })

    await context.setOffline(true)
    await page.reload()

    await page.locator(FILE_INPUT).setInputFiles(fixtureFiles(2))
    await page.getByRole('button', { name: 'Comprimir tudo' }).click()

    await expect(page.getByRole('button', { name: /^Baixar foto-\d+/ })).toHaveCount(2, {
      timeout: 90_000,
    })

    const badges = page.locator('li').getByText(/^−\d+%$/)
    await expect(badges).toHaveCount(2)

    await context.setOffline(false)
  })

  test('o manifesto descreve um app instalável', async ({ page }) => {
    const resposta = await page.request.get('/manifest.webmanifest')
    expect(resposta.ok()).toBe(true)

    const manifesto = (await resposta.json()) as Record<string, unknown>

    // O que decide se o navegador oferece a instalação: nome, ícone, escopo e
    // um `display` que não seja `browser`.
    expect(manifesto.name).toContain('Compressify')
    expect(manifesto.display).toBe('standalone')
    expect(manifesto.start_url).toBe('/')
    expect(Array.isArray(manifesto.icons)).toBe(true)
    expect((manifesto.icons as unknown[]).length).toBeGreaterThan(0)
  })
})
