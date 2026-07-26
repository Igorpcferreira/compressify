/**
 * A home.
 *
 * Server component: cabeçalho, herói, FAQ e rodapé saem no HTML estático, e só
 * a `QueueWorkspace` carrega JavaScript.
 */

import type { Metadata } from 'next'
import { StructuredData } from '@/components/landing/StructuredData'
import { ToolPage, type FaqItem } from '@/components/landing/ToolPage'
import { canonical } from '@/lib/site'

const DESCRIPTION =
  'Comprima e converta imagens em massa direto no navegador. Sem upload, sem limite, sem cadastro e sem marca d’água — seus arquivos nunca saem do seu computador.'

export const metadata: Metadata = {
  description: DESCRIPTION,
  alternates: { canonical: canonical('/') },
  openGraph: {
    title: 'Compressify — comprima qualquer imagem, sem upload',
    description: DESCRIPTION,
    url: canonical('/'),
    type: 'website',
    locale: 'pt_BR',
  },
}

const FAQ: readonly FaqItem[] = [
  {
    question: 'Meus arquivos são enviados para algum servidor?',
    answer:
      'Não. A compressão acontece dentro do seu navegador, com WebAssembly. O site é uma exportação estática: não existe servidor de processamento para onde enviar nada, e você pode confirmar isso na aba Rede do navegador.',
  },
  {
    question: 'Existe limite de quantidade ou de tamanho?',
    answer:
      'Não impomos limite. O que limita é a memória da sua máquina — a fila processa vários arquivos em paralelo respeitando um orçamento de memória, e imagens muito grandes rodam sozinhas para não derrubar a aba.',
  },
  {
    question: 'Quais formatos são aceitos?',
    answer:
      'Entrada em JPG, PNG, WebP e AVIF. Saída em qualquer um dos quatro, ou no modo inteligente, que escolhe WebP para tudo e mantém AVIF como AVIF.',
  },
  {
    question: 'Dá para chegar num tamanho específico?',
    answer:
      'Sim. No modo Meta você escolhe 5, 10 ou 50 MB — ou um valor livre. O algoritmo faz uma busca binária na qualidade e, se ainda não couber, reduz a resolução em degraus, sem descer abaixo de 900 pixels no menor lado.',
  },
]

export default function Home() {
  return (
    <>
      <StructuredData name="Compressify" description={DESCRIPTION} url={canonical('/')} faq={FAQ} />
      <ToolPage
        title={
          <>
            Comprima qualquer imagem.
            <br />
            Sem upload.
          </>
        }
        plainTitle="Comprimir imagens"
        description="Em massa, sem limite, sem cadastro e sem marca d’água. Os arquivos são processados dentro do seu navegador e nunca saem do seu computador."
        faq={FAQ}
      />
    </>
  )
}
