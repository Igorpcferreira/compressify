/**
 * A comparação antes/depois e o progresso no título da aba.
 *
 * Os dois só existem de verdade num navegador: um depende de `<dialog>` nativo,
 * de `URL.createObjectURL` e de o navegador decodificar os dois arquivos; o
 * outro depende de `document.title`, que em Node é nada.
 *
 * O que mais importa aqui é o `<dialog>`: a escolha de usar o elemento nativo
 * foi feita para ganhar armadilha de foco, `Esc` e inerte de graça — e "de
 * graça" é uma afirmação sobre o navegador, então ela é medida nos três.
 */

import { expect, type Page, test } from '@playwright/test'
import { fixtureFiles } from './fixtures'

const FILE_INPUT = 'input[type="file"]:not([webkitdirectory])'

/** Comprime um arquivo e devolve quando o card estiver pronto. */
async function comprimirUm(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator(FILE_INPUT).setInputFiles(fixtureFiles(1))
  await page.getByRole('button', { name: 'Comprimir tudo' }).click()
  await expect(page.getByRole('button', { name: /^Baixar foto-\d+/ })).toHaveCount(1, {
    timeout: 90_000,
  })
}

test.describe('comparação antes e depois', () => {
  test('abre, mostra as duas imagens e fecha com Esc', async ({ page }) => {
    await comprimirUm(page)

    await page.getByRole('button', { name: /^Comparar foto-\d+/ }).click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()

    // As duas imagens carregaram de verdade — `naturalWidth` só é maior que
    // zero depois de o navegador decodificar os bytes. Sem isto o teste
    // passaria com dois `<img>` quebrados.
    const antes = modal.getByRole('img', { name: /antes da compressão/ })
    const depois = modal.getByRole('img', { name: /depois da compressão/ })

    for (const imagem of [antes, depois]) {
      await expect
        .poll(async () => imagem.evaluate((el: HTMLImageElement) => el.naturalWidth))
        .toBeGreaterThan(0)
    }

    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
  })

  test('a divisória é operável pelo teclado', async ({ page }) => {
    await comprimirUm(page)
    await page.getByRole('button', { name: /^Comparar foto-\d+/ }).click()

    // A razão de a divisória ser um `<input type="range">` em vez de uma div
    // com `onPointerMove`: isto funciona sem nenhuma linha de código de teclado.
    const divisoria = page.getByRole('slider', { name: /divisória/i })
    await expect(divisoria).toHaveValue('50')

    await divisoria.focus()
    await page.keyboard.press('Home')
    await expect(divisoria).toHaveValue('0')

    await page.keyboard.press('End')
    await expect(divisoria).toHaveValue('100')
  })

  test('o botão só aparece quando existe resultado para comparar', async ({ page }) => {
    await page.goto('/')
    await page.locator(FILE_INPUT).setInputFiles(fixtureFiles(1))

    await expect(page.getByRole('button', { name: /^Comparar/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'Comprimir tudo' }).click()
    await expect(page.getByRole('button', { name: /^Comparar foto-\d+/ })).toHaveCount(1, {
      timeout: 90_000,
    })
  })
})

test.describe('progresso no título da aba', () => {
  test('conta os concluídos enquanto roda e devolve o título no fim', async ({ page }) => {
    await page.goto('/')
    const original = await page.title()

    await page.locator(FILE_INPUT).setInputFiles(fixtureFiles(4, { width: 1400, height: 1050 }))
    await page.getByRole('button', { name: 'Comprimir tudo' }).click()

    await expect.poll(async () => page.title(), { timeout: 90_000 }).toMatch(/^\(\d+\/4\) /)

    await expect(page.getByRole('button', { name: /^Baixar foto-\d+/ })).toHaveCount(4, {
      timeout: 90_000,
    })

    // O título volta ao que era: uma aba marcada com um lote que já acabou é
    // pior que uma aba sem contador.
    await expect.poll(async () => page.title()).toBe(original)
  })
})
