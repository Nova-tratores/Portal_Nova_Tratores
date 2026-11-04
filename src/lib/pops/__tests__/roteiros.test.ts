import { describe, expect, it } from 'vitest'
import {
  etapaPeloTicket, mensagemAvisoConclusao, pendentesAoConcluirOS, prazoDaEtapa, proximaEtapa, roteiroTerminou,
  situacaoRoteiro, validarRoteiro, type EtapaOS, type StatusEtapa,
} from '../roteiros'

const U = '11111111-1111-4111-8111-111111111111'
const P = '22222222-2222-4222-8222-222222222222'
const etapa = (ordem: number, status: StatusEtapa, nome = `E${ordem}`): EtapaOS => ({
  id: `e${ordem}`, ordem, nome, pop_id: P, responsavel_id: U, prazo_dias: null, status, ticket_id: null, liberada_em: null, concluida_em: null,
})
// Caso de origem: trator levado a um evento.
const EVENTO = ['Saída da loja', 'Chegada no evento', 'Saída do evento', 'Chegada na loja']

describe('validarRoteiro', () => {
  it('aceita o roteiro do evento', () => {
    const r = validarRoteiro({ nome: 'Demonstração em evento', area_id: U, etapas: EVENTO.map((nome) => ({ nome, pop_id: P, prazo_dias: '1' })) })
    expect('dados' in r && r.dados.etapas.map((e) => e.prazo_dias)).toEqual([1, 1, 1, 1])
  })
  it('recusa sem etapa, sem POP ou prazo absurdo', () => {
    expect(validarRoteiro({ nome: 'Evento', area_id: U, etapas: [] })).toEqual({ erro: 'Inclua pelo menos uma etapa.' })
    expect('erro' in validarRoteiro({ nome: 'Evento', area_id: U, etapas: [{ nome: 'Saída' }] })).toBe(true)
    expect('erro' in validarRoteiro({ nome: 'Evento', area_id: U, etapas: [{ nome: 'Saída', pop_id: P, prazo_dias: 999 }] })).toBe(true)
    expect('erro' in validarRoteiro({ nome: 'Ev', area_id: U, etapas: [{ nome: 'Saída', pop_id: P }] })).toBe(true)
  })
})

describe('proximaEtapa (uma de cada vez)', () => {
  it('começa pela 1ª', () => {
    expect(proximaEtapa(EVENTO.map((n, i) => etapa(i + 1, 'pendente', n)))?.nome).toBe('Saída da loja')
  })
  it('não libera outra enquanto uma está em andamento', () => {
    expect(proximaEtapa([etapa(1, 'liberada'), etapa(2, 'pendente')])).toBeNull()
  })
  it('pula as feitas e as puladas, na ordem (mesmo fora de ordem no array)', () => {
    expect(proximaEtapa([etapa(3, 'pendente'), etapa(1, 'concluida'), etapa(2, 'pulada')])?.ordem).toBe(3)
  })
  it('tudo feito → nada', () => {
    expect(proximaEtapa([etapa(1, 'concluida'), etapa(2, 'pulada')])).toBeNull()
  })
})

describe('situação e fim', () => {
  it('x de y e etapa atual', () => {
    const s = situacaoRoteiro([etapa(1, 'concluida'), etapa(2, 'liberada'), etapa(3, 'pendente')])
    expect([s.feitas, s.total, s.atual?.ordem, s.terminou]).toEqual([1, 3, 2, false])
  })
  it('terminou só com todas feitas/puladas', () => {
    expect(roteiroTerminou([etapa(1, 'concluida'), etapa(2, 'pulada')])).toBe(true)
    expect(roteiroTerminou([])).toBe(false)
  })
})

describe('aviso ao concluir a OS', () => {
  it('lista o que falta só nos roteiros ativos', () => {
    const p = pendentesAoConcluirOS([
      { nome: 'Evento', status: 'ativo', etapas: [etapa(2, 'pendente', 'Chegada no evento'), etapa(1, 'concluida')] },
      { nome: 'Antigo', status: 'cancelado', etapas: [etapa(1, 'pendente')] },
    ])
    expect(p).toEqual(['Evento: Chegada no evento'])
    expect(mensagemAvisoConclusao(p)).toContain('1 checklist(s)')
    expect(mensagemAvisoConclusao([])).toBeNull()
  })
})

describe('prazo e ticket', () => {
  it('prazo em dias a partir de hoje', () => {
    expect(prazoDaEtapa('2026-11-04', 2)).toBe('2026-11-06')
    expect(prazoDaEtapa('2026-11-30', 1)).toBe('2026-12-01')
    expect(prazoDaEtapa('2026-11-04', null)).toBeNull()
  })
  it('ticket da execução decide a etapa', () => {
    expect(etapaPeloTicket('resolvido')).toBe('concluir')
    expect(etapaPeloTicket('fechado')).toBe('concluir')
    expect(etapaPeloTicket('cancelado')).toBe('cancelada')
    expect(etapaPeloTicket(null)).toBe('cancelada')
    expect(etapaPeloTicket('em_andamento')).toBe('manter')
  })
})
