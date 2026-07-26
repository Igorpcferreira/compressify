/**
 * O critério de aceite #3 do brief, automatizado.
 *
 * "Nenhuma requisição de rede carregando conteúdo do usuário" é **a** promessa
 * do produto. Uma promessa verificada uma vez à mão e escrita no README vira
 * mentira na primeira regressão; aqui ela roda em cada PR, nos três motores.
 *
 * O teste faz três afirmações independentes, em ordem crescente de força:
 *
 * 1. Nenhuma requisição sai da origem do site.
 * 2. Nenhuma requisição tem corpo — não existe POST, PUT ou PATCH.
 * 3. Nenhum corpo de requisição contém o marcador que está dentro do arquivo
 *    de teste. Esta é a que pega o caso esperto: um upload disfarçado de GET
 *    com os bytes em query string também falharia.
 */

import { expect, test, type Request } from '@playwright/test'
import { PRIVACY_MARKER, pngFixture } from './fixtures'

interface Observed {
  url: string
  method: string
  body: string | null
}

test('nenhum byte do usuário sai do navegador', async ({ page, baseURL }) => {
  const observed: Observed[] = []

  const record = (request: Request): void => {
    observed.push({ url: request.url(), method: request.method(), body: request.postData() })
  }

  page.on('request', record)

  await page.goto('/')

  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles([
    {
      name: 'documento-confidencial.png',
      mimeType: 'image/png',
      buffer: pngFixture({ width: 800, height: 600, marker: PRIVACY_MARKER }),
    },
  ])

  await page.getByRole('button', { name: 'Comprimir tudo' }).click()
  await expect(page.getByRole('button', { name: /^Baixar documento-confidencial/ })).toBeVisible({
    timeout: 90_000,
  })

  // Também baixa: o caminho de saída é onde um upload "para gerar o link"
  // costuma se esconder em ferramentas parecidas.
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /^Baixar documento-confidencial/ }).click()
  await download

  const origin = new URL(baseURL ?? 'http://127.0.0.1:4321').origin

  /**
   * `blob:` e `data:` **não são rede**. Uma URL de blob resolve contra o
   * armazenamento em memória do próprio navegador; não existe socket, não
   * existe destino. O WebKit registra o carregamento do worker e o download por
   * esse esquema, e contá-los como "requisição externa" seria confundir o
   * mecanismo com um vazamento. Tudo que usa http(s) continua sob a régua.
   */
  const localSchemes = ['blob:', 'data:', 'about:']
  const externas = observed.filter(
    (request) =>
      !request.url.startsWith(origin) &&
      !localSchemes.some((scheme) => request.url.startsWith(scheme)),
  )
  const comCorpo = observed.filter((request) => request.body !== null)
  const comMarcador = observed.filter(
    (request) =>
      request.body?.includes(PRIVACY_MARKER) === true || request.url.includes(PRIVACY_MARKER),
  )

  expect(externas.map((request) => request.url)).toEqual([])
  expect(comCorpo.map((request) => `${request.method} ${request.url}`)).toEqual([])
  expect(comMarcador).toEqual([])

  // Sanidade: se a lista estivesse vazia, as três asserções acima passariam
  // sem terem observado nada. O HTML e os chunks têm que estar lá.
  expect(observed.length).toBeGreaterThan(3)
})

test('a exportação estática não tem endpoint para onde enviar', async ({ request, baseURL }) => {
  // A promessa é estrutural, não só comportamental (docs/PLANO.md §1.5): não
  // existe function no deploy. Um POST em qualquer caminho não encontra nada.
  const response = await request.post(`${baseURL ?? ''}/api/upload`, {
    data: { teste: true },
    failOnStatusCode: false,
  })

  expect(response.ok()).toBe(false)
})
