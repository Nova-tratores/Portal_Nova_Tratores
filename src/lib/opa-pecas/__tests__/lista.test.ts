import { describe, expect, it } from 'vitest'
import { filtrarLista, opcoesDaColuna, ordenarLista, VAZIO, type ColunaLista } from '../lista'

interface L { nome: string; qtd: number | null; tags: string[] }
const linhas: L[] = [
  { nome: 'Bomba', qtd: 10, tags: ['urgente'] },
  { nome: 'arruela', qtd: 2, tags: [] },
  { nome: 'Correia', qtd: null, tags: ['feira', 'urgente'] },
  { nome: '', qtd: 5, tags: ['feira'] },
]
const colunas: ColunaLista<L>[] = [
  { chave: 'nome', ordem: (l) => l.nome },
  { chave: 'qtd', ordem: (l) => l.qtd },
  { chave: 'tags', ordem: (l) => l.tags.join(', '), valores: (l) => l.tags },
]

describe('ordenarLista', () => {
  it('A→Z ignora maiúscula e põe vazio no fim', () => {
    expect(ordenarLista(linhas, colunas, { chave: 'nome', asc: true }).map((l) => l.nome)).toEqual(['arruela', 'Bomba', 'Correia', ''])
  })
  it('Z→A mantém o vazio no fim', () => {
    expect(ordenarLista(linhas, colunas, { chave: 'nome', asc: false }).map((l) => l.nome)).toEqual(['Correia', 'Bomba', 'arruela', ''])
  })
  it('número ordena como número', () => {
    expect(ordenarLista(linhas, colunas, { chave: 'qtd', asc: true }).map((l) => l.qtd)).toEqual([2, 5, 10, null])
  })
  it('sem ordem devolve como veio', () => {
    expect(ordenarLista(linhas, colunas, null)).toBe(linhas)
  })
})

describe('filtrarLista', () => {
  it('coluna com vários valores casa se qualquer um estiver marcado', () => {
    expect(filtrarLista(linhas, colunas, { tags: ['urgente'] }).map((l) => l.nome)).toEqual(['Bomba', 'Correia'])
  })
  it('(vazio) filtra quem não tem valor', () => {
    expect(filtrarLista(linhas, colunas, { tags: [VAZIO] }).map((l) => l.nome)).toEqual(['arruela'])
  })
  it('várias colunas = E', () => {
    expect(filtrarLista(linhas, colunas, { tags: ['feira'], nome: ['Correia'] }).map((l) => l.nome)).toEqual(['Correia'])
  })
})

describe('opcoesDaColuna', () => {
  it('conta os valores respeitando os filtros das outras colunas', () => {
    expect(opcoesDaColuna(linhas, colunas, { nome: ['Correia', 'Bomba'] }, 'tags')).toEqual([
      { valor: 'feira', n: 1 }, { valor: 'urgente', n: 2 },
    ])
  })
  it('ignora o próprio filtro e põe (vazio) por último', () => {
    expect(opcoesDaColuna(linhas, colunas, { nome: ['x'] }, 'nome').map((o) => o.valor)).toEqual(['arruela', 'Bomba', 'Correia', VAZIO])
  })
})
