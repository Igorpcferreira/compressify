/**
 * Os perfis de saída.
 *
 * A invariante que importa aqui é uma só: **o perfil aceso é derivado das
 * opções**. Não existe um campo `profile` no estado, então não existe a
 * possibilidade clássica de o rótulo dizer "Web" enquanto a qualidade está em
 * 40. Estes testes prendem essa derivação nos dois sentidos.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_OPTIONS } from '@/lib/defaults'
import { matchProfile, profileById, PROFILES } from '@/lib/profiles'

describe('perfis', () => {
  it('todo perfil se reconhece a partir das próprias opções', () => {
    for (const profile of PROFILES) {
      expect(matchProfile(profile.options)?.id).toBe(profile.id)
    }
  })

  it('cada perfil tem descrição — ela vira o nome acessível do botão', () => {
    for (const profile of PROFILES) {
      expect(profile.description.length).toBeGreaterThan(profile.label.length)
    }
  })

  it('mexer num controle qualquer cai em "Personalizado"', () => {
    const web = PROFILES[0]
    if (!web) throw new Error('a lista de perfis não pode estar vazia')

    expect(matchProfile({ ...web.options, quality: web.options.quality - 1 })).toBeNull()
    expect(matchProfile({ ...web.options, outputFormat: 'png' })).toBeNull()
    expect(matchProfile({ ...web.options, mode: 'target' })).toBeNull()
  })

  it('ignora a meta de tamanho quando o modo é automático', () => {
    const web = PROFILES.find((profile) => profile.options.mode === 'auto')
    if (!web) throw new Error('esperava ao menos um perfil automático')

    // No modo automático o motor nem lê o preset. Deixá-lo desfazer o casamento
    // faria o perfil apagar por causa de um campo que a tela não mostra.
    expect(matchProfile({ ...web.options, preset: 50 })?.id).toBe(web.id)
    expect(matchProfile({ ...web.options, customTargetMb: 3 })?.id).toBe(web.id)
  })

  it('considera a meta de tamanho quando o modo é meta', () => {
    const email = PROFILES.find((profile) => profile.options.mode === 'target')
    if (!email) throw new Error('esperava ao menos um perfil de meta')

    expect(matchProfile({ ...email.options, preset: 50 })).toBeNull()
  })

  it('o padrão do app não é nenhum perfil — é o padrão do Electron', () => {
    // Se um dia um perfil coincidir com o padrão, o rótulo "Personalizado"
    // some da primeira visita. É uma decisão de produto, e este teste força
    // que ela seja tomada de propósito.
    expect(matchProfile(DEFAULT_OPTIONS)).toBeNull()
  })

  it('resolve por id e ignora id desconhecido', () => {
    expect(profileById('web')?.label).toBe('Web')
    expect(profileById('nao-existe')).toBeUndefined()
  })
})
