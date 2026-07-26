/**
 * A área de trabalho: tudo que depende da store fica sob este componente.
 *
 * Ele é o limite entre o que é estático e o que é interativo. Acima dele a
 * página é HTML puro pré-renderizado — herói, selo, cabeçalho — e é isso que
 * mantém o custo de JavaScript inicial baixo para a meta de Lighthouse.
 */

'use client'

import { useEffect } from 'react'
import type { ImageFormat } from '@/engine/core/types'
import { useQueueStore } from '@/store/queue'
import { ActionBar } from './ActionBar'
import { ConversionBar } from './ConversionBar'
import { Dropzone } from './Dropzone'
import { OptionsPanel } from './OptionsPanel'
import { QueueList } from './QueueList'
import { RejectedNotice } from './RejectedNotice'
import { useTitleProgress } from './useTitleProgress'

export interface QueueWorkspaceProps {
  /**
   * O par que a landing de `/jpg-para-webp` já escolheu por quem chegou nela.
   *
   * Chega como prop, e não lido da URL aqui dentro, porque a página é quem sabe
   * o que promete: o componente não deveria adivinhar o próprio endereço.
   */
  conversion?: { from: ImageFormat | null; to: ImageFormat }
}

export function QueueWorkspace({ conversion }: QueueWorkspaceProps = {}) {
  const addFiles = useQueueStore((state) => state.addFiles)
  const hydratePreferences = useQueueStore((state) => state.hydratePreferences)
  const applyConversion = useQueueStore((state) => state.applyConversion)

  // Primitivos nas dependências, não o objeto: um literal vindo da página teria
  // identidade nova a cada render e o efeito voltaria a rodar por nada.
  const from = conversion?.from ?? null
  const to = conversion?.to ?? null

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
    // O par da landing vem **depois** da hidratação, e nesta ordem de
    // propósito: quem entra por "/jpg-para-webp" pediu aquilo agora, e isso
    // ganha da preferência guardada numa visita anterior.
    if (to) applyConversion({ from, to })
  }, [hydratePreferences, applyConversion, from, to])

  useTitleProgress()

  return (
    <div className="flex flex-col gap-6">
      {/*
        O dropzone vem primeiro, e o seletor de par logo depois — não antes.
        A captura do README mostrou por quê: com o seletor no topo, a primeira
        coisa dentro da ferramenta virava uma pergunta ("para qual formato?")
        em vez da ação que a página anuncia no `h1` ("arraste seus arquivos").
        Nas landings de conversão o par já está dito no título e na faixa de
        destaque, então nada se perde estando aqui.
      */}
      <Dropzone onFiles={addFiles} />
      <RejectedNotice />
      <ConversionBar />
      <OptionsPanel />
      <ActionBar />
      <QueueList />
    </div>
  )
}
