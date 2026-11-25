import { describe, it, expect } from 'vitest'
import { interpretarComando, lerPrazoNatural } from '../comando'

const pessoas = [
  { id: 'm', nome: 'Mariano Pereira' },
  { id: 'h', nome: 'Henri Souza' },
  { id: 'j', nome: 'José Ortiz' },
  { id: 'a1', nome: 'Ana Paula Lima' },
  { id: 'a2', nome: 'Ana Clara Souza' },
  { id: 'v', nome: 'Vinícius Rocha' },
]
const HOJE = '2026-11-25' // quarta-feira

const pedido = (frase: string) => {
  const c = interpretarComando(frase, pessoas, HOJE)
  if (c?.tipo !== 'pedir') throw new Error(`não virou pedido: ${frase}`)
  return { id: c.pessoa?.id ?? null, titulo: c.titulo, prazo: c.prazo }
}

describe('Ctrl+K — as 10 frases de teste (melhorias 5.4)', () => {
  it.each([
    ['pedir pro Mariano atualizar custo das máquinas até sexta', 'm', 'Atualizar custo das máquinas', '2026-11-27'],
    ['pede pra Henri revisar o contrato da frota amanhã', 'h', 'Revisar o contrato da frota', '2026-11-26'],
    ['pedir para o José configurar a impressora até 05/12', 'j', 'Configurar a impressora', '2026-12-05'],
    ['pedir ao vinicius ligar para o cliente hoje', 'v', 'Ligar para o cliente', '2026-11-25'],
    ['pedir pra Ana Clara mandar o relatório de vendas até segunda', 'a2', 'Mandar o relatório de vendas', '2026-11-30'],
    ['peça pro Mariano trocar o óleo do trator 6075 em 3 dias', 'm', 'Trocar o óleo do trator 6075', '2026-11-28'],
    ['pedir pro henri: conferir notas fiscais até quarta', 'h', 'Conferir notas fiscais', '2026-12-02'],
    ['solicitar ao José instalar o antivírus na semana que vem', 'j', 'Instalar o antivírus', '2026-12-04'],
    ['pedir pro Mariano orçar pneus para a colheitadeira', 'm', 'Orçar pneus para a colheitadeira', null],
    ['mandar pro Vinícius fechar o caixa até 10/01', 'v', 'Fechar o caixa', '2027-01-10'],
  ])('%s', (frase, id, titulo, prazo) => {
    expect(pedido(frase)).toEqual({ id, titulo, prazo })
  })
})

describe('Ctrl+K — outros casos', () => {
  it('nome repetido não escolhe sozinho', () => {
    const c = interpretarComando('pedir pra Ana mandar o relatório', pessoas, HOJE)
    expect(c).toMatchObject({ tipo: 'pedir', pessoa: null })
    expect(c?.tipo === 'pedir' && c.candidatos.length).toBe(2)
  })
  it('sexta numa sexta é a da outra semana', () => {
    expect(lerPrazoNatural('fazer até sexta', '2026-11-27').prazo).toBe('2026-12-04')
  })
  it('navegação e número do pedido', () => {
    expect(interpretarComando('minha fila', pessoas, HOJE)).toEqual({ tipo: 'ir', destino: '/fila', rotulo: 'Minha fila' })
    expect(interpretarComando('ir para a faxina', pessoas, HOJE)).toMatchObject({ tipo: 'ir', destino: '/fila/faxina' })
    expect(interpretarComando('Reuniões', pessoas, HOJE)).toMatchObject({ tipo: 'ir', destino: '/reunioes' })
    expect(interpretarComando('ir para #305', pessoas, HOJE)).toEqual({ tipo: 'ticket', numero: 305 })
    expect(interpretarComando('#12', pessoas, HOJE)).toEqual({ tipo: 'ticket', numero: 12 })
  })
  it('frase sem sentido não vira nada', () => {
    expect(interpretarComando('bom dia', pessoas, HOJE)).toBeNull()
    expect(interpretarComando('', pessoas, HOJE)).toBeNull()
  })
})
