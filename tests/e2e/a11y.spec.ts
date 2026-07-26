/**
 * Acessibilidade e SEO — o que dá para afirmar sem um humano na frente.
 *
 * Sem `axe-core`: uma varredura automática pega contraste e rótulo faltando,
 * mas nada do que quebra de verdade neste produto, que é **operar a fila só
 * com o teclado**. O que está aqui é o caminho completo — Tab até o dropzone,
 * escolher formato com as setas, comprimir com Enter — e as âncoras que a
 * busca lê.
 */

import { expect, test } from '@playwright/test'
import { fixtureFiles } from './fixtures'

const ROTAS = [
  { path: '/', title: /Compressify/, h1: /Comprima qualquer imagem/ },
  { path: '/comprimir-imagem/', title: /Comprimir imagem/, h1: /Comprimir imagem/ },
  { path: '/converter-webp/', title: /Converter para WebP/, h1: /Converter para WebP/ },
  { path: '/converter-avif/', title: /Converter para AVIF/, h1: /Converter para AVIF/ },
  // Uma das doze geradas: elas passam pelas mesmas exigências das escritas à
  // mão, senão gerar página vira desculpa para gerar página pior.
  { path: '/jpg-para-webp/', title: /Converter JPG para WebP/, h1: /Converter JPG para WebP/ },
]

test.describe('estrutura das páginas', () => {
  for (const rota of ROTAS) {
    test(`${rota.path} tem título, h1 único e marcos de página`, async ({ page }) => {
      await page.goto(rota.path)

      await expect(page).toHaveTitle(rota.title)
      await expect(page.locator('h1')).toHaveCount(1)
      await expect(page.locator('h1')).toContainText(rota.h1)

      await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
      await expect(page.getByRole('banner')).toBeVisible()
      await expect(page.getByRole('main')).toBeVisible()
      await expect(page.getByRole('contentinfo')).toBeVisible()

      const description = page.locator('meta[name="description"]')
      await expect(description).toHaveAttribute('content', /.{80,}/)
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1)
    })
  }

  test('o conteúdo vem no HTML, não montado por JavaScript', async ({ browser }) => {
    // Sem JavaScript o produto não funciona — mas o texto que a busca lê tem
    // que estar no documento mesmo assim.
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/comprimir-imagem/')

    await expect(page.locator('h1')).toContainText('Comprimir imagem')
    await expect(page.getByText('Perguntas frequentes')).toBeVisible()
    await expect(page.getByText('Arraste seus arquivos')).toBeVisible()

    await context.close()
  })
})

test.describe('teclado', () => {
  test('o pulo para a ferramenta é o primeiro foco', async ({ page, browserName }) => {
    await page.goto('/')

    const pulo = page.getByRole('link', { name: 'Pular para a ferramenta' })

    // O Safari não põe links na ordem de Tab a menos que "Acesso total pelo
    // teclado" esteja ligado — é configuração do sistema, não do documento.
    // Onde isso vale, verificamos a posição; em todo lugar verificamos o que
    // depende de nós: o link existe, recebe foco e **aparece** ao focar.
    if (browserName !== 'webkit') {
      await page.keyboard.press('Tab')
      await expect(page.locator(':focus')).toHaveText('Pular para a ferramenta')
    }

    await pulo.focus()
    await expect(pulo).toBeFocused()
    await expect(pulo).toBeVisible()

    await page.keyboard.press('Enter')
    await expect(page.getByRole('region', { name: /Comprimir|Converter/ })).toBeInViewport()
  })

  test('dá para operar a fila inteira sem mouse', async ({ page }) => {
    await page.goto('/')

    // O `setInputFiles` substitui o clique no seletor de arquivos, que o
    // navegador não deixa automatizar. Tudo depois disto é teclado.
    await page
      .locator('input[type="file"]:not([webkitdirectory])')
      .setInputFiles(fixtureFiles(2, { width: 400, height: 300 }))

    const formato = page.getByRole('radio', { name: 'Inteligente' })
    await formato.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('radio', { name: 'Original' })).toBeFocused()
    await expect(page.getByRole('radio', { name: 'Original' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    const qualidade = page.getByRole('slider', { name: /Qualidade/ })
    await qualidade.focus()
    const antes = await qualidade.inputValue()
    await page.keyboard.press('ArrowLeft')
    expect(Number(await qualidade.inputValue())).toBe(Number(antes) - 1)

    const comprimir = page.getByRole('button', { name: 'Comprimir tudo' })
    await comprimir.focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('button', { name: /^Baixar foto-1/ })).toBeVisible({
      timeout: 90_000,
    })
  })

  test('cada controle tem nome acessível', async ({ page }) => {
    await page.goto('/')
    await page
      .locator('input[type="file"]:not([webkitdirectory])')
      .setInputFiles(fixtureFiles(1, { width: 320, height: 240 }))

    for (const botao of await page.getByRole('button').all()) {
      const nome = ((await botao.getAttribute('aria-label')) ?? (await botao.innerText())).trim()
      expect(nome.length).toBeGreaterThan(0)
    }

    // A barra de progresso anuncia valor, não só existe.
    await page.getByRole('button', { name: 'Comprimir tudo' }).click()
    const barra = page.getByRole('progressbar').first()
    await expect(barra).toHaveAttribute('aria-valuenow', /\d+/)
    await expect(barra).toHaveAttribute('aria-label', /Progresso de/)
  })
})

test.describe('tema', () => {
  test('o alternador troca o tema e sobrevive ao recarregamento', async ({ page }) => {
    await page.goto('/')

    const html = page.locator('html')
    const inicial = await html.getAttribute('data-theme')

    await page.getByRole('button', { name: /Modo (escuro|claro)/ }).click()
    const trocado = inicial === 'dark' ? 'light' : 'dark'
    await expect(html).toHaveAttribute('data-theme', trocado)

    await page.reload()
    // Resolvido antes da primeira pintura pelo ThemeScript: sem flash e sem
    // depender da hidratação.
    await expect(html).toHaveAttribute('data-theme', trocado)
  })
})

test.describe('compartilhamento', () => {
  test('a imagem de Open Graph existe e é um PNG', async ({ page, request }) => {
    await page.goto('/')

    const url = await page.locator('meta[property="og:image"]').getAttribute('content')
    expect(url).toBeTruthy()

    // A rota de metadata do Next sai **sem extensão** na exportação estática.
    // Se o host servir isso como octet-stream, o cartão não renderiza em lugar
    // nenhum — e o erro só aparece quando alguém compartilha o link.
    const response = await request.get(new URL(url ?? '').pathname)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')

    const bytes = await response.body()
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  })

  test('o favicon responde, sem 404 no console', async ({ request }) => {
    expect((await request.get('/icon.svg')).status()).toBe(200)
  })
})
