/**
 * Perfis de saída — "para a web", "para e-mail", "para impressão".
 *
 * A observação por trás disto: quase ninguém sabe o que significa qualidade 82.
 * As pessoas sabem para onde a foto vai. Um perfil é um nome para uma
 * combinação de preferências que já existe — ele não acrescenta nenhum
 * comportamento ao motor, e é justamente por isso que vale: a UI ganha uma
 * porta de entrada sem que o pipeline ganhe um caso especial.
 *
 * Cuidado de vocabulário: `JobOptions.preset` já significa **meta de tamanho**
 * (5/10/50 MB), herdado do app Electron. Por isso estes se chamam *perfis* e
 * não *presets* — dois "preset" no mesmo arquivo seria uma armadilha para quem
 * chegar depois.
 *
 * `matchProfile` é o que permite não ter estado duplicado: o perfil ativo é
 * **derivado** das opções, não guardado ao lado delas. Mexer na qualidade na
 * mão cai em "Personalizado" sozinho, e voltar a bater com um perfil o
 * reacende — sem nenhuma sincronização para dar errado.
 */

import type { JobOptions } from '@/engine/core/types'

export interface Profile {
  id: string
  label: string
  /** Vira o nome acessível do botão: o rótulo sozinho não explica a escolha. */
  description: string
  options: JobOptions
}

export const PROFILES: readonly Profile[] = [
  {
    id: 'web',
    label: 'Web',
    description: 'Para a web: converte para WebP e prioriza o menor arquivo',
    options: { mode: 'auto', preset: 5, outputFormat: 'smart', quality: 78 },
  },
  {
    id: 'email',
    label: 'E-mail',
    description: 'Para e-mail: garante que cada arquivo caiba em 5 MB',
    options: { mode: 'target', preset: 5, outputFormat: 'smart', quality: 85 },
  },
  {
    id: 'impressao',
    label: 'Impressão',
    description: 'Para impressão: mantém o formato original e prioriza o detalhe',
    options: { mode: 'auto', preset: 5, outputFormat: 'original', quality: 95 },
  },
] as const

/**
 * O perfil cujas opções batem com as atuais, ou `null` para "Personalizado".
 *
 * `customTargetMb` só entra na comparação quando o preset é `custom`: no modo
 * automático ele nem é lido pelo motor, e considerá-lo faria um perfil deixar
 * de casar por causa de um campo invisível na tela.
 */
export function matchProfile(options: JobOptions): Profile | null {
  return (
    PROFILES.find((profile) => {
      const target = profile.options

      if (options.mode !== target.mode) return false
      if (options.outputFormat !== target.outputFormat) return false
      if (options.quality !== target.quality) return false
      if (options.mode === 'auto') return true

      if (options.preset !== target.preset) return false
      if (options.preset !== 'custom') return true

      return options.customTargetMb === target.customTargetMb
    }) ?? null
  )
}

export function profileById(id: string): Profile | undefined {
  return PROFILES.find((profile) => profile.id === id)
}
