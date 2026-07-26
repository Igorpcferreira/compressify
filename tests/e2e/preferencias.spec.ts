/**
 * As preferências ficam, e os perfis escrevem nelas.
 *
 * Isto só pode ser provado num navegador de verdade: o que está em jogo é
 * `localStorage` sobrevivendo a um recarregamento, e o efeito de hidratação
 * rodando **depois** da montagem sem quebrar a página pré-renderizada.
 *
 * O teste também é a rede de segurança da decisão descrita em
 * `QueueWorkspace`: se alguém "otimizar" a hidratação lendo `localStorage`
 * durante a primeira renderização, o React vai reclamar de divergência — e o
 * caso do JavaScript desligado, no `a11y.spec.ts`, quebra junto.
 */

import { expect, type Page, test } from '@playwright/test'

const CHAVE = 'compressify:preferencias:1'

/**
 * Espera a hidratação antes de tocar em qualquer controle.
 *
 * A página vai ao ar pré-renderizada e **funciona como HTML** antes de o React
 * assumir — o que é uma qualidade do produto e uma armadilha para o teste: uma
 * seta pressionada nesse intervalo mexe no valor do `<input>` nativo, não chega
 * na store, e some no primeiro render do React, que é controlado. Foi assim que
 * este arquivo falhou só no WebKit e só sob carga.
 *
 * O sinal usado é do próprio produto, não um marcador inventado para o teste:
 * o `ThemeToggle` sai da pré-renderização com o rótulo neutro "Alternar tema"
 * (o `getServerSnapshot` devolve `null`) e só descobre o tema real depois de
 * hidratado.
 */
async function aguardarHidratacao(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: /^Modo (claro|escuro)$/ })).toBeVisible()
}

test.describe('preferências', () => {
  test('a escolha sobrevive ao recarregamento', async ({ page }) => {
    await page.goto('/')
    await aguardarHidratacao(page)

    const qualidade = page.getByRole('slider', { name: /qualidade/i })
    await qualidade.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')

    const escolhido = await qualidade.inputValue()
    expect(Number(escolhido)).toBeLessThan(82)

    await expect
      .poll(async () => page.evaluate((chave) => localStorage.getItem(chave), CHAVE))
      .toContain(`"quality":${escolhido}`)

    await page.reload()

    await expect(page.getByRole('slider', { name: /qualidade/i })).toHaveValue(escolhido)
  })

  test('um perfil escreve modo, formato e qualidade de uma vez', async ({ page }) => {
    await page.goto('/')
    await aguardarHidratacao(page)

    const impressao = page.getByRole('button', { name: /para impressão/i })
    await impressao.click()

    await expect(impressao).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('slider', { name: /qualidade/i })).toHaveValue('95')
    await expect(page.getByRole('radio', { name: 'Original' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await page.reload()
    await expect(page.getByRole('button', { name: /para impressão/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('mexer num controle apaga o perfil e mostra "Personalizado"', async ({ page }) => {
    await page.goto('/')
    await aguardarHidratacao(page)

    const web = page.getByRole('button', { name: /para a web/i })
    await web.click()
    await expect(web).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('slider', { name: /qualidade/i }).focus()
    await page.keyboard.press('ArrowRight')

    await expect(web).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByText('Personalizado')).toBeVisible()
  })

  test('preferência corrompida não derruba a página', async ({ page }) => {
    // `localStorage` é editável, e um valor de uma versão futura ou de um dedo
    // curioso não pode virar tela branca. O painel volta ao padrão.
    await page.addInitScript(
      ([chave]) => {
        localStorage.setItem(chave as string, '{"quality":"muita","mode":"turbo"}')
      },
      [CHAVE],
    )

    await page.goto('/')
    await aguardarHidratacao(page)

    await expect(page.getByRole('slider', { name: /qualidade/i })).toHaveValue('82')
    await expect(page.getByRole('radio', { name: 'Modo automático' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  test('nada sobre os arquivos é guardado', async ({ page }) => {
    await page.goto('/')
    await aguardarHidratacao(page)
    await page.getByRole('button', { name: /para e-mail/i }).click()

    const guardado = await page.evaluate(() => ({ ...localStorage }))

    // A promessa de privacidade vale para o disco local também. Só duas chaves
    // podem existir — a preferência de compressão e a de tema — e este teste é
    // o que obriga qualquer terceira a ser uma decisão consciente.
    expect(Object.keys(guardado)).toContain(CHAVE)
    for (const chave of Object.keys(guardado)) {
      expect([CHAVE, 'compressify-tema']).toContain(chave)
    }

    expect(JSON.parse(guardado[CHAVE] as string)).toEqual({
      mode: 'target',
      preset: 5,
      outputFormat: 'smart',
      quality: 85,
    })
  })
})
