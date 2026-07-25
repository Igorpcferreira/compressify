import { spawn } from 'node:child_process'

const command = process.argv[2]
const forwardedArgs = process.argv.slice(3)

if (!command) {
  console.error('Informe o comando do electron-vite: dev ou preview.')
  process.exit(1)
}

const env = {}

for (const [key, value] of Object.entries(process.env)) {
  if (key.toUpperCase() !== 'ELECTRON_RUN_AS_NODE' && typeof value === 'string') {
    env[key] = value
  }
}

const executable = process.platform === 'win32' ? 'electron-vite' : 'electron-vite'
const child = spawn(executable, [command, ...forwardedArgs], {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32'
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
