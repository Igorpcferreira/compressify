/**
 * Resolve o tema antes da primeira pintura.
 *
 * Precisa ser um script inline e síncrono no <head>: se rodasse depois da
 * hidratação, quem escolheu modo escuro veria um flash branco a cada
 * navegação. Como a página é estática (`output: 'export'`), não há servidor
 * que possa saber a preferência de antemão.
 *
 * A ordem é: escolha explícita salva > preferência do sistema > claro.
 */
const script = `
(function () {
  try {
    var salvo = localStorage.getItem('compressify-tema')
    var tema = salvo === 'light' || salvo === 'dark'
      ? salvo
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    document.documentElement.setAttribute('data-theme', tema)
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light')
  }
})()
`

export function ThemeScript() {
  // O conteúdo é uma constante literal deste arquivo, sem entrada de usuário.
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
