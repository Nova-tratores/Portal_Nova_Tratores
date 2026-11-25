import { describe, it, expect } from 'vitest'
import { textoCusto, horasPessoa, encaminhamentosDaAta, prazoPadrao, jaCriado } from '../fila-reuniao'

const pessoas = [
  { id: 'h', nome: 'Henri Souza' },
  { id: 'j', nome: 'José Ortiz' },
  { id: 'a1', nome: 'Ana Paula Lima' },
  { id: 'a2', nome: 'Ana Clara Souza' },
]

describe('custo da reunião', () => {
  it('4 pessoas × 30 min = 2 h', () => {
    expect(horasPessoa(4, 30)).toBe(2)
    expect(textoCusto(4, 30)).toBe('4 pessoas × 30 min = 2 h')
    expect(textoCusto(3, 30)).toBe('3 pessoas × 30 min = 1,5 h')
    expect(textoCusto(1, 30)).toBe('1 pessoa × 30 min = 30 min')
  })
})

describe('@pessoa na ata vira encaminhamento', () => {
  const hoje = '2026-11-25' // quarta
  it('acha pelo primeiro nome, sem acento, e lê "até dd/mm"', () => {
    const [e] = encaminhamentosDaAta('Falamos do fornecedor.\n@henri trocar o fornecedor de filtros até 05/12', pessoas, hoje)
    expect(e).toMatchObject({ responsavel_id: 'h', titulo: 'Trocar o fornecedor de filtros', prazo: '2026-12-05', prazoDaLinha: true })
    expect(encaminhamentosDaAta('@Jose ligar pro banco', pessoas, hoje)[0].responsavel_id).toBe('j')
  })
  it('sem prazo na linha = 7 dias, fora do fim de semana', () => {
    expect(prazoPadrao('2026-11-25')).toBe('2026-12-02')
    expect(prazoPadrao('2026-11-28')).toBe('2026-12-07') // sábado + 7 = sábado → segunda
    expect(encaminhamentosDaAta('@Henri: revisar contrato', pessoas, hoje)[0]).toMatchObject({ prazo: '2026-12-02', prazoDaLinha: false })
  })
  it('data que já passou neste ano vai para o próximo', () => {
    expect(encaminhamentosDaAta('@Henri fechar o balanço até 10/01', pessoas, hoje)[0].prazo).toBe('2027-01-10')
  })
  it('nome repetido fica ambíguo; com sobrenome desempata', () => {
    const [x] = encaminhamentosDaAta('@Ana mandar o relatório', pessoas, hoje)
    expect(x).toMatchObject({ responsavel_id: null, ambiguo: true })
    expect(encaminhamentosDaAta('@Ana.Clara mandar o relatório', pessoas, hoje)[0].responsavel_id).toBe('a2')
  })
  it('ninguém com esse nome, linha sem texto e @ no meio da frase não viram nada errado', () => {
    expect(encaminhamentosDaAta('@Zezo ver o pneu', pessoas, hoje)[0]).toMatchObject({ responsavel_id: null, ambiguo: false })
    expect(encaminhamentosDaAta('@Henri', pessoas, hoje)).toHaveLength(0)
    expect(encaminhamentosDaAta('mandar e-mail para @Henri amanhã', pessoas, hoje)).toHaveLength(0)
    expect(encaminhamentosDaAta('- @Henri ver o pneu', pessoas, hoje)).toHaveLength(1)
  })
  it('não cria duas vezes o que já virou pedido', () => {
    const [e] = encaminhamentosDaAta('@Henri trocar o fornecedor', pessoas, hoje)
    expect(jaCriado(e, [{ responsavel_id: 'h', titulo: 'trocar o fornecedor' }])).toBe(true)
    expect(jaCriado(e, [{ responsavel_id: 'j', titulo: 'Trocar o fornecedor' }])).toBe(false)
  })
})
