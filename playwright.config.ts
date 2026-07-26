/**
 * E2E nos três motores.
 *
 * Roda contra o **build de produção servido estaticamente**, não contra o
 * `next dev`. Dois motivos: é o artefato que vai para a Vercel, com os mesmos
 * chunks e os mesmos `.wasm`, e é a única forma de o `privacy.spec.ts` afirmar
 * algo de verdade — no dev existe o websocket de HMR, que poluiria a inspeção
 * de requisições.
 *
 * O `npx serve` não entra no projeto: o `next start` não funciona com
 * `output: 'export'`, então o servidor é o `http-server` embutido do Node, via
 * um script próprio (`scripts/serve-out.mjs`). Uma dependência a menos.
 */

import { defineConfig, devices } from '@playwright/test'

const PORT = 4321
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  // Os codecs em WASM são lentos no Firefox (3–10x o Chromium, docs/SPIKE.md
  // §4). Um teto curto reprovaria o navegador em vez do produto.
  timeout: 120_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  webServer: {
    command: `node scripts/serve-out.mjs ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
