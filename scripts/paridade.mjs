/**
 * Reexecuta a comparação com o app Electron e reescreve
 * `docs/COMPARACAO-ELECTRON.md`.
 *
 * A medição inteira mora no teste (`tests/integration/electron-parity.test.ts`),
 * que roda junto com o resto da suíte. Este script só liga a escrita do
 * relatório, e existe porque `RELATORIO_PARIDADE=1 vitest` não é a mesma linha
 * no cmd, no PowerShell e no bash.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))

// O binário é chamado pelo caminho do módulo, não por `npx`: no Windows o Node
// 24 recusa `spawn` de um `.cmd` sem shell, e abrir um shell só para isto seria
// trocar um problema de portabilidade por outro.
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))

const filho = spawn(
  process.execPath,
  [vitest, 'run', 'tests/integration/electron-parity.test.ts'],
  {
    cwd: raiz,
    stdio: 'inherit',
    env: { ...process.env, RELATORIO_PARIDADE: '1' },
  },
)

filho.on('exit', (code) => {
  if (code === 0) {
    console.log('\ndocs/COMPARACAO-ELECTRON.md reescrito a partir da medição.')
  }
  process.exit(code ?? 1)
})
