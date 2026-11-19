import { describe, expect, it } from 'vitest'
import { montarLinhaDoTempo, quando } from '../linhaDoTempo'

const vazio = { itens: [], reunioes: [], tarefas: [], custos: [], leads: [], apoios: [], roleta: null }

describe('linha do tempo da campanha', () => {
  it('data sem hora fica no mesmo dia; ISO vira o dia de São Paulo', () => {
    expect(quando('2026-11-20')?.dia).toBe('2026-11-20')
    // 01:30 UTC do dia 21 = 22:30 do dia 20 em São Paulo
    expect(quando('2026-11-21T01:30:00Z')?.dia).toBe('2026-11-20')
    expect(quando(null)).toBeNull()
  })

  it('ordena da mais antiga para a mais nova e junta reunião, decisão e tarefa', () => {
    const ev = montarLinhaDoTempo({
      ...vazio,
      hoje: '2026-11-18',
      acao: { nome: 'Black Friday 2026', criado_em: '2026-10-01T10:00:00-03:00', data_inicio: '2026-11-20', data_fim: '2026-11-30' },
      reunioes: [{ id: 'r1', numero: 12, titulo: 'Comercial', prazo: '2026-10-15T09:00:00-03:00' }],
      itens: [{ id: 'i1', reuniao_id: 'r1', pergunta: 'Qual o prêmio maior?', resultado: 'decidido', decisao_texto: 'Revisão grátis', decisao_motivo: 'atrai quem tem trator' }],
      tarefas: [{ numero: 99, titulo: 'Comprar bonés', status: 'aberto', criado_em: '2026-10-15T10:00:00-03:00', resolvido_em: null }],
    })
    expect(ev.map((e) => e.titulo)).toEqual([
      'Campanha cadastrada no portal',
      'Reunião nº 12 — Comercial',
      'Tarefa nº 99: Comprar bonés',
      'Começa a campanha',
      'Termina a campanha',
    ])
    expect(ev[1].linhas?.[0]).toBe('Qual o prêmio maior? → Decidido: Revisão grátis (porque atrai quem tem trator)')
    expect(ev[1].link).toBe('/reunioes/r1')
  })

  it('leads e roleta viram um acontecimento por dia; custo cancelado não entra', () => {
    const ev = montarLinhaDoTempo({
      ...vazio,
      acao: { nome: 'X', criado_em: '2026-11-01T10:00:00-03:00', data_inicio: null, data_fim: null },
      leads: [{ capturado_em: '2026-11-02T10:00:00-03:00' }, { capturado_em: '2026-11-02T15:00:00-03:00' }],
      roleta: { slug: 'bf', participacoes: [{ criado_em: '2026-11-03T10:00:00-03:00' }] },
      custos: [{ descricao: 'Banner', valor: 100, status: 'cancelado', data: '2026-11-02' }],
    })
    expect(ev.map((e) => e.titulo)).toEqual(['Campanha cadastrada no portal', '2 leads cadastrados', '1 pessoa participou da roleta'])
  })
})
