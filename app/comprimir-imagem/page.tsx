import type { Metadata } from 'next'
import { StructuredData } from '@/components/landing/StructuredData'
import { ToolPage, type FaqItem } from '@/components/landing/ToolPage'
import { canonical } from '@/lib/site'

const TITLE = 'Comprimir imagem online e grátis'
const DESCRIPTION =
  'Reduza o tamanho de JPG, PNG, WebP e AVIF em massa, no seu navegador. Escolha uma meta em MB ou deixe no automático — sem upload, sem cadastro e sem marca d’água.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonical('/comprimir-imagem') },
  keywords: ['comprimir imagem', 'reduzir tamanho de foto', 'compressor de imagem online'],
  openGraph: {
    title: `${TITLE} · Compressify`,
    description: DESCRIPTION,
    url: canonical('/comprimir-imagem'),
    type: 'website',
    locale: 'pt_BR',
  },
}

const FAQ: readonly FaqItem[] = [
  {
    question: 'Quanto dá para reduzir sem estragar a imagem?',
    answer:
      'Depende da foto, mas o modo automático costuma tirar entre 60% e 90% de uma foto de celular sem diferença visível — ele desce uma escada de qualidade e para no primeiro degrau que já fica menor que o original.',
  },
  {
    question: 'A imagem perde resolução?',
    answer:
      'No modo automático, nunca: só a qualidade da compressão muda. No modo meta, se a qualidade sozinha não alcançar o tamanho pedido, a resolução cai em degraus de 16%, e nunca abaixo de 900 pixels no menor lado.',
  },
  {
    question: 'Posso comprimir uma pasta inteira?',
    answer:
      'Pode. Arraste a pasta ou use "Escolher pasta": as subpastas são percorridas e a estrutura é preservada no ZIP e no "Salvar em pasta".',
  },
  {
    question: 'Os originais são alterados?',
    answer:
      'Não. Nada é lido do disco além do que você escolhe, e o resultado sai com o sufixo -compressify, então nenhum arquivo é sobrescrito.',
  },
]

export default function ComprimirImagem() {
  return (
    <>
      <StructuredData
        name={TITLE}
        description={DESCRIPTION}
        url={canonical('/comprimir-imagem')}
        faq={FAQ}
      />
      <ToolPage
        title={
          <>
            Comprimir imagem.
            <br />
            No seu navegador.
          </>
        }
        plainTitle={TITLE}
        description={DESCRIPTION}
        faq={FAQ}
      />
    </>
  )
}
