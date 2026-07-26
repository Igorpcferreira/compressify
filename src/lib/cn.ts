/**
 * Junta classes condicionais.
 *
 * Deliberadamente sem `clsx` e sem `tailwind-merge`: são 12 linhas, e o
 * produto promete não carregar nada que não precise. A ausência de merge de
 * classes conflitantes é uma escolha — os componentes daqui expõem variantes,
 * não aceitam sobrescrita arbitrária de utilitário.
 */
export type ClassValue = string | false | null | undefined

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}
