import { describe, expect, it } from 'vitest'
import {
  SaveCancelledError,
  saveToDirectory,
  supportsDirectoryPicker,
  type DirectoryHandleLike,
} from '@/lib/fsAccess'

/**
 * Uma pasta de mentira, com a mesma forma da File System Access API.
 *
 * O que precisa ser provado é a recriação da árvore: `getDirectoryHandle` com
 * `create: true` a cada segmento, e o arquivo no fim. Um handle falso mostra
 * isso com precisão — e sem escrever no disco de quem roda os testes.
 */
function fakeDirectory(name = 'Downloads') {
  const written = new Map<string, string>()
  const created: string[] = []

  function makeDirectory(handleName: string, prefix: string): DirectoryHandleLike {
    return {
      name: handleName,

      getDirectoryHandle(child, options) {
        const path = prefix ? `${prefix}/${child}` : child
        created.push(`${path}${options?.create ? ' (create)' : ''}`)
        return Promise.resolve(makeDirectory(child, path))
      },

      getFileHandle(child, options) {
        const path = prefix ? `${prefix}/${child}` : child
        return Promise.resolve({
          createWritable() {
            let contents = ''
            return Promise.resolve({
              async write(data: Blob) {
                contents += await data.text()
              },
              close() {
                if (options?.create !== false) written.set(path, contents)
                return Promise.resolve()
              },
            })
          },
        })
      },
    }
  }

  return { directory: makeDirectory(name, ''), written, created }
}

function blobOf(text: string): Blob {
  return new Blob([text])
}

describe('supportsDirectoryPicker', () => {
  it('é falso quando o navegador não expõe showDirectoryPicker', () => {
    // É o caso do Node destes testes, do Firefox e do Safari.
    expect(supportsDirectoryPicker()).toBe(false)
  })
})

describe('saveToDirectory', () => {
  it('escreve os arquivos na pasta escolhida', async () => {
    const target = fakeDirectory()

    const result = await saveToDirectory(
      [
        { path: 'a-compressify.webp', blob: blobOf('AAA') },
        { path: 'b-compressify.png', blob: blobOf('BB') },
      ],
      { directory: target.directory },
    )

    expect(result).toEqual({ directoryName: 'Downloads', written: 2 })
    expect([...target.written.entries()]).toEqual([
      ['a-compressify.webp', 'AAA'],
      ['b-compressify.png', 'BB'],
    ])
  })

  it('recria a árvore de subpastas', async () => {
    const target = fakeDirectory()

    await saveToDirectory([{ path: 'viagem/2026/praia-compressify.webp', blob: blobOf('P') }], {
      directory: target.directory,
    })

    expect(target.created).toEqual(['viagem (create)', 'viagem/2026 (create)'])
    expect(target.written.get('viagem/2026/praia-compressify.webp')).toBe('P')
  })

  it('descarta segmentos que tentariam sair da pasta escolhida', async () => {
    const target = fakeDirectory()

    await saveToDirectory([{ path: '../../etc/passwd-compressify.webp', blob: blobOf('X') }], {
      directory: target.directory,
    })

    // `..` nunca aparece em `webkitRelativePath`, mas confiar nisso é como se
    // escreve fora da pasta que o usuário autorizou.
    expect(target.created).toEqual(['etc (create)'])
    expect([...target.written.keys()]).toEqual(['etc/passwd-compressify.webp'])
  })

  it('reporta progresso por arquivo', async () => {
    const target = fakeDirectory()
    const percentages: number[] = []

    await saveToDirectory(
      [
        { path: 'a.webp', blob: blobOf('1') },
        { path: 'b.webp', blob: blobOf('2') },
        { path: 'c.webp', blob: blobOf('3') },
        { path: 'd.webp', blob: blobOf('4') },
      ],
      { directory: target.directory, onProgress: (percent) => percentages.push(percent) },
    )

    expect(percentages).toEqual([25, 50, 75, 100])
  })

  it('para no meio quando o usuário cancela', async () => {
    const target = fakeDirectory()
    const controller = new AbortController()

    await expect(
      saveToDirectory(
        [
          { path: 'a.webp', blob: blobOf('1') },
          { path: 'b.webp', blob: blobOf('2') },
        ],
        {
          directory: target.directory,
          signal: controller.signal,
          onProgress: () => controller.abort(),
        },
      ),
    ).rejects.toBeInstanceOf(SaveCancelledError)

    expect([...target.written.keys()]).toEqual(['a.webp'])
  })

  it('desiste quando não há seletor de pasta nem pasta injetada', async () => {
    await expect(saveToDirectory([{ path: 'a.webp', blob: blobOf('1') }])).rejects.toMatchObject({
      name: 'AbortedError',
    })
  })
})
