import type { Metadata } from 'next'
import { StructuredData } from '@/components/landing/StructuredData'
import { ToolPage, type FaqItem } from '@/components/landing/ToolPage'
import { canonical } from '@/lib/site'

const TITLE = 'Converter para WebP online'
const DESCRIPTION =
  'Converta JPG, PNG e AVIF para WebP em massa, direto no navegador. O formato que economiza banda sem trocar de qualidade — sem upload e sem cadastro.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonical('/converter-webp') },
  keywords: ['converter webp', 'jpg para webp', 'png para webp'],
  openGraph: {
    title: `${TITLE} · Compressify`,
    description: DESCRIPTION,
    url: canonical('/converter-webp'),
    type: 'website',
    locale: 'pt_BR',
  },
}

const FAQ: readonly FaqItem[] = [
  {
    question: 'Por que WebP e não JPG?',
    answer:
      'Para a mesma qualidade percebida, o WebP costuma gerar arquivos 25% a 35% menores que o JPG, e ainda suporta transparência, o que o JPG não faz. Todos os navegadores atuais exibem WebP.',
  },
  {
    question: 'Como escolher o WebP na ferramenta?',
    answer:
      'Em "Formato de saída", escolha WebP. O modo Inteligente também converte tudo para WebP — ele só mantém AVIF como AVIF, para não desfazer um formato ainda mais eficiente.',
  },
  {
    question: 'PNG com transparência continua transparente?',
    answer:
      'Sim. O WebP preserva o canal alfa, então logotipos e imagens recortadas continuam com fundo transparente.',
  },
  {
    question: 'Dá para converter em lote?',
    answer:
      'É o caso normal aqui. Arraste quantos arquivos quiser (ou uma pasta), converta todos de uma vez e baixe em um ZIP só.',
  },
]

export default function ConverterWebp() {
  return (
    <>
      <StructuredData
        name={TITLE}
        description={DESCRIPTION}
        url={canonical('/converter-webp')}
        faq={FAQ}
      />
      <ToolPage
        title={
          <>
            Converter para WebP.
            <br />
            Em lote, sem upload.
          </>
        }
        plainTitle={TITLE}
        description={DESCRIPTION}
        faq={FAQ}
      />
    </>
  )
}
