/**
 * Gera o service worker a partir do que o build realmente emitiu.
 *
 * Roda depois do `next build`, dentro do `npm run build`. Não dá para escrever
 * este arquivo à mão: os chunks têm hash no nome, e uma lista de precache
 * escrita à mão apontaria para o build anterior — que é o modo clássico de um
 * PWA servir uma versão fantasma para sempre.
 *
 * ### O que entra no precache e o que não entra
 *
 * **Entra o casco, e só ele:** os documentos e exatamente os recursos que os
 * documentos referenciam — o CSS, os chunks iniciais, as fontes, o manifesto e
 * o ícone. A lista não é "todo `.js` do build": é o que sai do próprio HTML,
 * pela mesma técnica que o Incremento 3 usou para provar que nenhum codec
 * vazava para o bundle inicial.
 *
 * A diferença é grande e é o ponto: varrer o diretório inteiro daria 1,7 MB,
 * porque arrastaria junto os chunks que só são carregados sob demanda — o
 * worker, o do ZIP, a cola dos codecs. Precachear tudo isso obrigaria quem
 * abriu a página uma vez, e talvez não volte, a baixar o produto inteiro.
 *
 * **Não entram os `.wasm`**, pelo mesmo motivo levado ao extremo: são 9,7 MB de
 * codec, e baixá-los na primeira visita para alguém que talvez só comprima um
 * JPEG seria cobrar de todo mundo o custo de todos os formatos — exatamente o
 * que o carregamento sob demanda do Incremento 3 evitou. Eles entram no cache
 * **quando são usados**, pela regra de runtime: quem comprimiu um AVIF uma vez
 * comprime AVIF offline depois.
 *
 * Sem `workbox` e sem `next-pwa`: são dezenas de KB e uma dependência viva para
 * substituir as ~60 linhas de service worker que este projeto de fato precisa.
 * E a regra de não carregar script de terceiros vale aqui como vale no HTML.
 */

import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const SAIDA = join(RAIZ, 'out')

/**
 * Além do que o HTML referencia, estes entram porque nada os referencia por
 * `src`/`href` no documento e mesmo assim fazem parte do app instalado.
 */
const SEMPRE = ['/manifest.webmanifest', '/icon.svg']

/** O que nunca deve ser cacheado, nem no precache nem em runtime. */
const NUNCA = ['/sw.js']

/**
 * As landings "X para Y" ficam **fora** do casco — só elas, não os chunks que
 * elas compartilham com o resto do app.
 *
 * É a mesma regra dos `.wasm`, aplicada a documentos: são doze páginas, 562 KB
 * de HTML, e quem chega pela home vai abrir no máximo uma. Precacheá-las
 * inflaria o casco de 832 KB para 1,4 MB — +68% na primeira visita — para
 * guardar onze páginas que aquela pessoa não vai ver.
 *
 * Elas continuam funcionando offline **depois de visitadas**: a navegação é
 * rede-primeiro e grava no cache o que carregou, exatamente como o codec entra
 * no cache quando é usado.
 *
 * O padrão é o formato do slug de `lib/conversions.ts` (`jpg-para-webp`). Se
 * ele mudar lá, muda aqui — e o teste `sw.test.ts` é o que avisa.
 */
const FORA_DO_CASCO = /^\/[a-z0-9]+-para-[a-z0-9]+\/$/

async function arquivos(diretorio) {
  const encontrados = []

  for (const entrada of await readdir(diretorio, { withFileTypes: true })) {
    const caminho = join(diretorio, entrada.name)
    if (entrada.isDirectory()) {
      encontrados.push(...(await arquivos(caminho)))
    } else {
      encontrados.push(caminho)
    }
  }

  return encontrados
}

function paraUrl(caminho) {
  const relativo = relative(SAIDA, caminho).split('\\').join('/')
  // `trailingSlash: true` gera `rota/index.html`; a URL que o navegador pede é
  // `rota/`. Precachear o caminho do arquivo deixaria a navegação sem acerto.
  if (relativo === 'index.html') return '/'
  if (relativo.endsWith('/index.html')) return `/${relativo.slice(0, -'index.html'.length)}`
  return `/${relativo}`
}

/**
 * Os recursos que um documento referencia.
 *
 * Regex sobre o HTML em vez de um parser: o que interessa são os caminhos
 * absolutos de `/_next/`, que aparecem em `src`, `href` e nas listas de
 * preload — e todos têm a mesma forma. Um parser de DOM daria a mesma resposta
 * com uma dependência a mais.
 */
function referenciasDe(html) {
  const encontradas = new Set()

  for (const [, url] of html.matchAll(/["'(](\/_next\/[^"')\s]+)["')\s]/g)) {
    // O `&` escapado aparece em atributos HTML; o `.wasm` fica de fora por
    // decisão, não por acidente — ver o cabeçalho.
    const limpa = url.replaceAll('&amp;', '&')
    if (!limpa.endsWith('.wasm')) encontradas.add(limpa)
  }

  return encontradas
}

const todos = await arquivos(SAIDA)
const documentos = todos.filter((caminho) => caminho.endsWith('.html'))

/*
 * As referências saem de **todos** os documentos, inclusive dos que não entram
 * no casco: o chunk que a landing de conversão compartilha com a home custa
 * bytes uma vez só, e tê-lo em cache é o que faz a primeira visita a uma dessas
 * páginas ser rápida. O que fica de fora é o HTML delas, não o que elas usam.
 */
const referencias = new Set()
for (const documento of documentos) {
  for (const url of referenciasDe(await readFile(documento, 'utf8'))) {
    referencias.add(url)
  }
}

const paginas = documentos.map(paraUrl).filter((url) => !FORA_DO_CASCO.test(url))

const precache = [...new Set([...paginas, ...referencias, ...SEMPRE])]
  .filter((url) => !NUNCA.includes(url))
  .sort()

// Uma referência que não existe no disco quebraria o `addAll` inteiro — e um
// `install` que rejeita deixa o app sem service worker, silenciosamente.
for (const url of precache) {
  // `decodeURIComponent` porque a rota `app/[conversao]` emite um chunk dentro
  // de um diretório com colchetes no nome, e o HTML o referencia
  // percent-encoded (`%5Bconversao%5D`). A URL vai para o precache como está —
  // é ela que o navegador pede —, mas no disco o diretório tem colchetes.
  const caminho = join(SAIDA, decodeURIComponent(url.endsWith('/') ? `${url}index.html` : url))
  const existe = await stat(caminho).catch(() => null)

  if (!existe) {
    console.error(`Precache aponta para um arquivo que não existe: ${url}`)
    process.exit(1)
  }
}

/**
 * A versão do cache é o hash da lista.
 *
 * Assim ela muda exatamente quando o conteúdo muda: um build idêntico mantém o
 * cache (e a segunda visita continua instantânea), e um build diferente
 * invalida tudo de uma vez, sem depender de alguém lembrar de incrementar um
 * número à mão.
 */
const versao = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12)

const sw = `/**
 * Service worker do Compressify — GERADO. Não edite à mão.
 *
 * A fonte é scripts/gerar-sw.mjs, e ele roda dentro do \`npm run build\`.
 * Editar este arquivo funciona até o próximo build.
 */

const VERSAO = '${versao}'
const CASCO = 'compressify-casco-' + VERSAO
const RUNTIME = 'compressify-runtime-' + VERSAO

const PRECACHE = ${JSON.stringify(precache, null, 2)}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CASCO)
      .then((cache) => cache.addAll(PRECACHE))
      // \`skipWaiting\` só depois do precache: assumir o controle com o cache
      // pela metade serviria uma versão incompleta.
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves
            .filter((chave) => chave !== CASCO && chave !== RUNTIME)
            .map((chave) => caches.delete(chave)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const requisicao = event.request

  // Só GET de mesma origem. Um POST não é cacheável, e este produto não faz
  // nenhum — mas a guarda é o que impede que um dia alguém ache que faz.
  if (requisicao.method !== 'GET') return

  const url = new URL(requisicao.url)
  if (url.origin !== self.location.origin) return

  /*
   * Navegação: rede primeiro, cache depois.
   *
   * O contrário — cache primeiro — deixaria a pessoa presa numa versão antiga
   * até o service worker trocar, e este é um app que ganha capacidade a cada
   * deploy. Offline, o cache responde e o app funciona inteiro.
   */
  if (requisicao.mode === 'navigate') {
    event.respondWith(
      fetch(requisicao)
        .then((resposta) => {
          const copia = resposta.clone()
          caches.open(CASCO).then((cache) => cache.put(requisicao, copia))
          return resposta
        })
        .catch(async () => {
          const cache = await caches.open(CASCO)
          return (await cache.match(requisicao)) ?? (await cache.match('/')) ?? Response.error()
        }),
    )
    return
  }

  /*
   * O resto — chunks, fontes, .wasm — é cache primeiro.
   *
   * São todos imutáveis por construção: o nome tem hash, então um arquivo com
   * o mesmo nome tem o mesmo conteúdo. É o que faz os 3,4 MB do avif_enc serem
   * baixados no máximo uma vez por versão.
   */
  event.respondWith(
    caches.match(requisicao).then((acerto) => {
      if (acerto) return acerto

      return fetch(requisicao).then((resposta) => {
        // Respostas opacas ou de erro não entram: guardar um 404 seria
        // transformar uma falha temporária em permanente.
        if (!resposta.ok || resposta.type !== 'basic') return resposta

        const copia = resposta.clone()
        caches.open(RUNTIME).then((cache) => cache.put(requisicao, copia))
        return resposta
      })
    }),
  )
})
`

// As conferências vêm antes da escrita: publicar um service worker que não
// cacheia nada é pior que não publicar nenhum — ele fica instalado.
if (precache.length === 0) {
  console.error('Nenhum arquivo para precachear — o `next build` rodou?')
  process.exit(1)
}

if (!precache.includes('/')) {
  console.error('A raiz não está no precache — o app não abriria offline.')
  process.exit(1)
}

await writeFile(join(SAIDA, 'sw.js'), sw, 'utf8')

console.log(`sw.js gerado — versão ${versao}, ${precache.length} arquivos no casco.`)
