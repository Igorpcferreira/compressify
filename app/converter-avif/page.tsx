import type { Metadata } from 'next'
import { StructuredData } from '@/components/landing/StructuredData'
import { ToolPage, type FaqItem } from '@/components/landing/ToolPage'
import { canonical } from '@/lib/site'

const TITLE = 'Converter para AVIF online'
const DESCRIPTION =
  'Converta JPG, PNG e WebP para AVIF no navegador. O formato mais eficiente disponível hoje — arquivos menores que o WebP, com a mesma qualidade.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonical('/converter-avif') },
  keywords: ['converter avif', 'jpg para avif', 'png para avif'],
  openGraph: {
    title: `${TITLE} · Compressify`,
    description: DESCRIPTION,
    url: canonical('/converter-avif'),
    type: 'website',
    locale: 'pt_BR',
  },
}

const FAQ: readonly FaqItem[] = [
  {
    question: 'AVIF vale a pena em vez de WebP?',
    answer:
      'Em tamanho, sim: o AVIF costuma ficar 20% a 30% abaixo do WebP na mesma qualidade. O custo é o tempo de codificação, bem maior — e é por isso que a ferramenta usa o ponto de operação mais rápido do codificador.',
  },
  {
    question: 'Por que a conversão para AVIF demora mais?',
    answer:
      'O codificador AVIF é muito mais pesado que o do WebP. Medimos os pontos de operação e fixamos o mais rápido, que rende 6,3 vezes mais velocidade com perda mínima de compressão. Ainda assim, espere alguns segundos por foto grande — mais no Firefox.',
  },
  {
    question: 'Todo mundo consegue abrir AVIF?',
    answer:
      'Os navegadores atuais sim — Chrome, Edge, Firefox e Safari. Programas de desktop mais antigos podem não abrir; se o arquivo vai circular por e-mail, o WebP é a aposta mais segura.',
  },
  {
    question: 'O modo meta de tamanho funciona com AVIF?',
    answer:
      'Funciona, mas com uma ressalva honesta: como usamos o ponto de operação rápido do codificador, o resultado pode ficar um pouco fora da faixa de ±10% da meta. É melhor esforço, não garantia.',
  },
]

export default function ConverterAvif() {
  return (
    <>
      <StructuredData
        name={TITLE}
        description={DESCRIPTION}
        url={canonical('/converter-avif')}
        faq={FAQ}
      />
      <ToolPage
        title={
          <>
            Converter para AVIF.
            <br />O menor arquivo possível.
          </>
        }
        plainTitle={TITLE}
        description={DESCRIPTION}
        faq={FAQ}
      />
    </>
  )
}
