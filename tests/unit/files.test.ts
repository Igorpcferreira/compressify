import { describe, expect, it } from 'vitest'
import {
  MAX_SCAN_DEPTH,
  collectDroppedFiles,
  totalBytes,
  withRelativePath,
  type DataTransferLike,
} from '@/lib/files'
import { imageFile } from '../helpers/images'

/**
 * Entradas de sistema de arquivos falsas.
 *
 * O `readEntries` do padrão devolve os filhos **em lotes** e sinaliza o fim com
 * um lote vazio — o Chrome entrega 100 por vez. O duplo abaixo respeita isso,
 * que é justamente o detalhe que faz uma pasta grande perder arquivos quando
 * alguém chama `readEntries` uma vez só.
 */
function fileEntry(name: string) {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file(onSuccess: (file: File) => void) {
      onSuccess(imageFile({ name, bytes: 100 }))
    },
  }
}

interface EntryLike {
  isFile: boolean
  isDirectory: boolean
  name: string
}

function directoryEntry(name: string, children: EntryLike[], batchSize = 2) {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader() {
      let cursor = 0
      return {
        readEntries(onSuccess: (entries: EntryLike[]) => void) {
          const batch = children.slice(cursor, cursor + batchSize)
          cursor += batch.length
          onSuccess(batch)
        },
      }
    },
  }
}

function transferOf(entries: EntryLike[], files: File[] = []): DataTransferLike {
  return {
    items: entries.map((entry) => ({
      kind: 'file',
      webkitGetAsEntry: () => entry,
      getAsFile: () => null,
    })),
    files,
  }
}

describe('withRelativePath', () => {
  it('anexa o caminho a um arquivo que veio sem ele', () => {
    const file = withRelativePath(imageFile({ name: 'praia.jpg' }), 'viagem/praia.jpg')
    expect(file.webkitRelativePath).toBe('viagem/praia.jpg')
  })

  it('não sobrescreve o caminho que o navegador já preencheu', () => {
    const original = imageFile({ name: 'praia.jpg', relativePath: 'album/praia.jpg' })
    expect(withRelativePath(original, 'outro/praia.jpg').webkitRelativePath).toBe('album/praia.jpg')
  })
})

describe('collectDroppedFiles', () => {
  it('coleta arquivos soltos', async () => {
    const files = await collectDroppedFiles(transferOf([fileEntry('a.jpg'), fileEntry('b.png')]))

    expect(files.map((file) => file.name)).toEqual(['a.jpg', 'b.png'])
    expect(files.map((file) => file.webkitRelativePath)).toEqual(['a.jpg', 'b.png'])
  })

  it('desce em pastas preservando a estrutura relativa', async () => {
    const tree = directoryEntry('viagem', [
      fileEntry('capa.jpg'),
      directoryEntry('2026', [fileEntry('praia.jpg'), fileEntry('serra.png')]),
    ])

    const files = await collectDroppedFiles(transferOf([tree]))

    expect(files.map((file) => file.webkitRelativePath)).toEqual([
      'viagem/capa.jpg',
      'viagem/2026/praia.jpg',
      'viagem/2026/serra.png',
    ])
  })

  it('lê todos os lotes do readEntries, não só o primeiro', async () => {
    const many = Array.from({ length: 7 }, (_, index) => fileEntry(`foto-${index}.jpg`))
    const files = await collectDroppedFiles(transferOf([directoryEntry('lote', many, 2)]))

    expect(files).toHaveLength(7)
  })

  it('para na profundidade máxima em vez de seguir um link circular', async () => {
    // Uma pasta que contém a si mesma: sem o teto, isto não termina.
    const loop: EntryLike & { createReader?: unknown } = {
      isFile: false,
      isDirectory: true,
      name: 'loop',
    }
    Object.assign(loop, {
      createReader() {
        let served = false
        return {
          readEntries(onSuccess: (entries: EntryLike[]) => void) {
            const batch = served ? [] : [loop, fileEntry('folha.jpg')]
            served = true
            onSuccess(batch)
          },
        }
      },
    })

    const files = await collectDroppedFiles(transferOf([loop]))

    expect(files.length).toBeGreaterThan(0)
    expect(files.length).toBeLessThanOrEqual(MAX_SCAN_DEPTH + 1)
  })

  it('cai em DataTransfer.files quando não há webkitGetAsEntry', async () => {
    const solto = imageFile({ name: 'colado.png', bytes: 10 })
    const files = await collectDroppedFiles({
      items: [{ kind: 'file', getAsFile: () => solto }],
      files: [solto],
    })

    expect(files).toEqual([solto])
  })

  it('devolve lista vazia quando não há nada de arquivo no evento', async () => {
    expect(await collectDroppedFiles({ items: [], files: [] })).toEqual([])
  })
})

describe('totalBytes', () => {
  it('soma os tamanhos', () => {
    expect(totalBytes([{ size: 100 }, { size: 250 }])).toBe(350)
  })

  it('devolve zero para lista vazia', () => {
    expect(totalBytes([])).toBe(0)
  })
})
