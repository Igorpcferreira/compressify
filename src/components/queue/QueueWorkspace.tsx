/**
 * A área de trabalho: tudo que depende da store fica sob este componente.
 *
 * Ele é o limite entre o que é estático e o que é interativo. Acima dele a
 * página é HTML puro pré-renderizado — herói, selo, cabeçalho — e é isso que
 * mantém o custo de JavaScript inicial baixo para a meta de Lighthouse.
 */

'use client'

import { useQueueStore } from '@/store/queue'
import { ActionBar } from './ActionBar'
import { Dropzone } from './Dropzone'
import { OptionsPanel } from './OptionsPanel'
import { QueueList } from './QueueList'
import { RejectedNotice } from './RejectedNotice'

export function QueueWorkspace() {
  const addFiles = useQueueStore((state) => state.addFiles)

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
