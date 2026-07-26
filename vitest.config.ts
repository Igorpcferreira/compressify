import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // O grosso da suíte é lógica pura (estratégia de compressão, quantização,
    // nomenclatura, orçamento) e não precisa de DOM. Os poucos testes de
    // componente declaram `// @vitest-environment jsdom` no topo do arquivo.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/e2e/**'],
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/lib/**'],
      reporter: ['text', 'html'],
    },
  },
})
