/**
 * Servidor estático mínimo para `out/`.
 *
 * Existe para o Playwright exercitar exatamente o artefato que vai para o
 * deploy. `next start` não funciona com `output: 'export'`, e trazer um pacote
 * de servidor só para isso seria uma dependência a mais num projeto que promete
 * não carregar o que não precisa.
 *
 * Os dois cabeçalhos abaixo não são decoração: sem `Content-Type` correto o
 * navegador recusa o módulo do worker, e sem `application/wasm` o
 * `instantiateStreaming` cai no caminho lento — ou falha.
 */

import { closeSync, createReadStream, existsSync, openSync, readSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { createGzip } from 'node:zlib'

const ROOT = resolve(process.cwd(), 'out')
const PORT = Number(process.argv[2] ?? 4321)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

function resolveFile(urlPath) {
  // `normalize` + prefixo obrigatório: sem isso, `../..` sai da pasta servida.
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '')
  const candidate = join(ROOT, clean)
  if (!candidate.startsWith(ROOT)) return null

  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate

  const asIndex = join(candidate, 'index.html')
  if (existsSync(asIndex)) return asIndex

  const asHtml = `${candidate.replace(/[/\\]$/, '')}.html`
  return existsSync(asHtml) ? asHtml : null
}

/**
 * Comprimir aqui não é otimização de teste: é fidelidade.
 *
 * A Vercel serve tudo com gzip/brotli. Sem isto, uma medição de Lighthouse
 * contra este servidor reprova o produto por 378 KB que o deploy real nunca
 * transfere — mediria o harness, não a página.
 */
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.xml'])

/** Tipo pelos bytes mágicos, para arquivos sem extensão. */
function sniff(file) {
  const head = Buffer.alloc(8)
  const handle = openSync(file, 'r')
  try {
    readSync(handle, head, 0, 8, 0)
  } finally {
    closeSync(handle)
  }

  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }

  return null
}

createServer((request, response) => {
  const file = resolveFile(request.url ?? '/')

  if (!file) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('404')
    return
  }

  const extension = extname(file)
  const accepts = String(request.headers['accept-encoding'] ?? '').includes('gzip')
  const compress = accepts && COMPRESSIBLE.has(extension)

  // As rotas de metadata do Next (`opengraph-image`) saem **sem extensão** na
  // exportação estática. Um host que só olha o sufixo entrega
  // `application/octet-stream` e o cartão de compartilhamento não renderiza —
  // por isso os bytes mandam quando o nome não diz nada.
  const type = TYPES[extension] ?? sniff(file) ?? 'application/octet-stream'

  response.writeHead(200, {
    'content-type': type,
    'cache-control': 'no-store',
    ...(compress ? { 'content-encoding': 'gzip', vary: 'Accept-Encoding' } : {}),
  })

  const stream = createReadStream(file)
  if (compress) {
    stream.pipe(createGzip()).pipe(response)
  } else {
    stream.pipe(response)
  }
}).listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`out/ em http://127.0.0.1:${PORT}\n`)
})
