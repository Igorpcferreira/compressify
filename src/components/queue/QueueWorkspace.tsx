/**
 * A área de trabalho: tudo que depende da store fica sob este componente.
 *
 * Ele é o limite entre o que é estático e o que é interativo. Acima dele a
 * página é HTML puro pré-renderizado — herói, selo, cabeçalho — e é isso que
 * mantém o custo de JavaScript inicial baixo para a meta de Lighthouse.
 */

'use client'

import { useEffect } from 'react'
import { useQueueStore } from '@/store/queue'
import { ActionBar } from './ActionBar'
import { Dropzone } from './Dropzone'
import { OptionsPanel } from './OptionsPanel'
import { QueueList } from './QueueList'
import { RejectedNotice } from './RejectedNotice'
import { useTitleProgress } from './useTitleProgress'

export function QueueWorkspace() {
  const addFiles = useQueueStore((state) => state.addFiles)
  const hydratePreferences = useQueueStore((state) => state.hydratePreferences)

  /**
   * As preferências entram **depois** da montagem, e é deliberado.
   *
   * A página é pré-renderizada na build, onde `localStorage` não existe. Ler a
   * preferência durante a primeira renderização do cliente faria o React
   * encontrar um HTML diferente do que ele acabou de gerar — o painel diria
   * "meta · 10 MB" onde o documento diz "auto · 5 MB" — e isso é erro de
   * hidratação, não detalhe estético. O preço é um quadro com os padrões antes
   * dos valores guardados aparecerem, que é o mesmo preço que o `ThemeToggle`
   * paga pelo rótulo neutro.
   */
  useEffect(() => {
    hydratePreferences()
  }, [hydratePreferences])

  useTitleProgress()

  return (
    <div className="flex flex-col gap-6">
      <Dropzone onFiles={addFiles} />
      <RejectedNotice />
      <OptionsPanel />
      <ActionBar />
      <QueueList />
    </div>
  )
}
