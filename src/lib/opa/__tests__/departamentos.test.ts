import { describe, expect, it } from 'vitest'
import { destinoDoLocal, novoResponsavel, validarNomeDepartamento, type Departamento } from '../departamentos'

const dep = (id: string, extra: Partial<Departamento> = {}): Departamento => ({
  id, nome: id, gestor_id: `u-${id}`, gestor_nome: `Gestor ${id}`, padrao: false, ativo: true, ordem: 100, ...extra,
})

describe('destinoDoLocal', () => {
  const geral = dep('geral', { padrao: true })
  const pos = dep('pos')
  const ligacoes = [{ local_id: 'box_tecnico', departamento_id: 'pos' }]

  it('local ligado vai para o gestor do departamento', () => {
    const d = destinoDoLocal('box_tecnico', ligacoes, [geral, pos])
    expect(d).toMatchObject({ motivo: 'local', gestorId: 'u-pos', gestorNome: 'Gestor pos' })
    expect(d.departamento?.id).toBe('pos')
  })

  it('local sem departamento cai no padrão', () => {
    const d = destinoDoLocal('barracao_2', ligacoes, [geral, pos])
    expect(d).toMatchObject({ motivo: 'padrao', gestorId: 'u-geral' })
    expect(d.departamento?.id).toBe('geral')
  })

  it('departamento do local sem gestor: fica nele, aviso para o gestor geral', () => {
    const d = destinoDoLocal('box_tecnico', ligacoes, [geral, dep('pos', { gestor_id: null, gestor_nome: null })])
    expect(d.departamento?.id).toBe('pos')
    expect(d).toMatchObject({ motivo: 'padrao', gestorId: 'u-geral' })
  })

  it('departamento inativo não conta', () => {
    const d = destinoDoLocal('box_tecnico', ligacoes, [geral, dep('pos', { ativo: false })])
    expect(d.departamento?.id).toBe('geral')
  })

  it('nada configurado = ninguém (aviso geral)', () => {
    const d = destinoDoLocal('box_tecnico', [], [dep('geral', { padrao: true, gestor_id: null, gestor_nome: null })])
    expect(d).toMatchObject({ motivo: 'sem_configuracao', gestorId: null })
    expect(destinoDoLocal(null, [], []).departamento).toBeNull()
  })
})

describe('novoResponsavel', () => {
  it('vazio recebe o gestor', () => expect(novoResponsavel('', null, 'Ana')).toBe('Ana'))
  it('troca de território troca o gestor que estava', () => expect(novoResponsavel('Ana', 'ana', 'Bruno')).toBe('Bruno'))
  it('responsável escolhido à mão fica', () => expect(novoResponsavel('Carlos', 'Ana', 'Bruno')).toBe('Carlos'))
  it('sem gestor novo mantém o atual', () => expect(novoResponsavel('Carlos', null, null)).toBe('Carlos'))
})

describe('validarNomeDepartamento', () => {
  it('exige nome e limita 60', () => {
    expect(validarNomeDepartamento('  ')).toBeTruthy()
    expect(validarNomeDepartamento('x'.repeat(61))).toBeTruthy()
    expect(validarNomeDepartamento(' Pós-Vendas ')).toBeNull()
  })
})
