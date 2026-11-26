import { describe, it, expect } from 'vitest'
import { entrouSaiuPorSemana, prazosCumpridos, idadeMedia, segundaDe, textoResumoDia } from '../painel'

describe('painel de fluxo (melhorias 6.2)', () => {
  it('segunda da semana', () => {
    expect(segundaDe('2026-11-25')).toBe('2026-11-23') // quarta
    expect(segundaDe('2026-11-29')).toBe('2026-11-23') // domingo fica na semana que começou na segunda
    expect(segundaDe('2026-11-23')).toBe('2026-11-23')
  })
  it('entrou × saiu nas últimas semanas, a atual por último; fora da janela não conta', () => {
    const s = entrouSaiuPorSemana(['2026-11-24', '2026-11-25', '2026-11-17', '2026-01-01'], ['2026-11-25', '2026-11-10'], '2026-11-25', 3)
    expect(s).toEqual([
      { segunda: '2026-11-09', entrou: 0, saiu: 1 },
      { segunda: '2026-11-16', entrou: 1, saiu: 0 },
      { segunda: '2026-11-23', entrou: 2, saiu: 1 },
    ])
  })
  it('% de prazos cumpridos: no dia do prazo conta como cumprido', () => {
    expect(prazosCumpridos([{ prazo: '2026-11-10', concluido: '2026-11-10' }, { prazo: '2026-11-10', concluido: '2026-11-12' }, { prazo: '2026-11-20', concluido: '2026-11-01' }]))
      .toEqual({ pct: 67, cumpridos: 2, total: 3 })
    expect(prazosCumpridos([]).pct).toBeNull()
  })
  it('idade média em dias', () => {
    expect(idadeMedia(['2026-11-15', '2026-11-25'], '2026-11-25')).toBe(5)
    expect(idadeMedia([], '2026-11-25')).toBe(0)
  })
})

describe('resumo de fim de dia (melhorias 6.1)', () => {
  it('o texto do documento', () => {
    expect(textoResumoDia({ fechou: 3, passou: 1, chegaram: 2, proximo: { numero: 308, titulo: 'Trocar o fornecedor' } }))
      .toEqual({ titulo: 'Hoje você fechou 3 e passou 1 bola; chegaram 2 pedidos novos.', descricao: 'Amanhã começa por #308 Trocar o fornecedor' })
  })
  it('só o que aconteceu entra; nada aconteceu e fila vazia = sem aviso', () => {
    expect(textoResumoDia({ fechou: 0, passou: 0, chegaram: 1, proximo: null })).toEqual({ titulo: 'Hoje chegou 1 pedido novo.', descricao: 'Sua fila está vazia para amanhã.' })
    expect(textoResumoDia({ fechou: 0, passou: 0, chegaram: 0, proximo: null })).toBeNull()
    expect(textoResumoDia({ fechou: 0, passou: 0, chegaram: 0, proximo: { numero: 5, titulo: 'X' } })?.titulo).toBe('Seu dia na Central')
  })
})
