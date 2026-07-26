/**
 * Placeholder do Incremento 1.
 *
 * A home real (dropzone, fila, selo de privacidade) é o Incremento 5. Esta
 * página existe para que o build estático tenha uma rota e para provar que os
 * tokens do design system estão realmente ligados — se as fontes ou as cores
 * não estiverem, isto quebra visivelmente.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <p className="text-eyebrow text-text-muted uppercase">Fundação · Incremento 1</p>

      <h1 className="text-h1 font-display text-balance">Comprima qualquer arquivo. Sem upload.</h1>

      <p className="text-body text-text-muted max-w-prose text-pretty">
        Projeto em construção. O motor de compressão e a interface chegam nos próximos incrementos —
        o plano está em <code className="font-mono text-data">docs/PLANO.md</code> e as medições que
        o embasam em <code className="font-mono text-data">docs/SPIKE.md</code>.
      </p>

      <dl className="border-border grid gap-4 border-t pt-8 sm:grid-cols-3">
        {[
          { termo: 'Processamento', valor: '100% no navegador' },
          { termo: 'Arquivos enviados', valor: 'Nenhum' },
          { termo: 'Limite de lote', valor: 'Sem limite' },
        ].map(({ termo, valor }) => (
          <div key={termo} className="flex flex-col gap-1">
            <dt className="text-caption text-text-muted">{termo}</dt>
            <dd className="text-data font-mono font-medium">{valor}</dd>
          </div>
        ))}
      </dl>
    </main>
  )
}
