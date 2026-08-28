import { describe, expect, it } from 'vitest'
import {
  contarPorGravidade,
  ehGravidade,
  GRAVIDADES,
  GRAVIDADE_AJUDA,
  GRAVIDADE_COR,
  GRAVIDADE_LABEL,
  gravidadeDaPendencia,
  gravidadePadrao,
  ordenarPorGravidade,
  PESO,
} from '../gravidade'

const comp = (sistema: string, subsistema?: string, componente?: string) => ({ sistema, subsistema, componente })

describe('gravidade sugerida pelo componente', () => {
  it('sistema de segurança nasce grave; acabamento nasce leve', () => {
    expect(gravidadePadrao(comp('Freios', 'Dianteiro', 'Pastilhas'))).toBe('grave')
    expect(gravidadePadrao(comp('Direção', 'Coluna', 'Volante'))).toBe('grave')
    expect(gravidadePadrao(comp('Carroceria', 'Lataria', 'Para-choque'))).toBe('leve')
    expect(gravidadePadrao(comp('Ar-condicionado', 'Gás', 'Carga'))).toBe('leve')
  })

  it('NENHUM padrão é "crítica" — isso é decisão de quem viu o problema', () => {
    // o mesmo componente de freio pode ser desgaste normal ou "sem pastilha
    // nenhuma"; a tabela não sabe a diferença, a pessoa sabe
    const todos = [
      comp('Freios'), comp('Direção'), comp('Motor'), comp('Transmissão'),
      comp('Suspensão'), comp('Rodas e Pneus'), comp('Elétrica'), comp('Carroceria'),
      comp('Interior'), comp('Ar-condicionado'), comp('Itens de segurança'), comp('Outros'),
    ]
    for (const c of todos) {
      expect(gravidadePadrao(c), c.sistema).not.toBe('critica')
    }
  })

  it('a palavra do componente corrige o sistema quando ele erra', () => {
    // cinto é cadastrado no Interior (leve por sistema), mas é item de vida
    expect(gravidadePadrao(comp('Interior', 'Bancos', 'Cinto de segurança'))).toBe('grave')
    // tapete é Interior e continua leve
    expect(gravidadePadrao(comp('Interior', 'Tapetes e forrações', 'Tapete'))).toBe('leve')
    // pneu é "Rodas e Pneus" (média por sistema) e sobe pra grave
    expect(gravidadePadrao(comp('Rodas e Pneus', 'Pneus', 'Pneu dianteiro'))).toBe('grave')
    // farol é Elétrica e fica média — o exemplo do usuário de "pouco perigo"
    expect(gravidadePadrao(comp('Elétrica', 'Iluminação', 'Farol baixo'))).toBe('media')
  })

  it('o casamento por palavra ignora ACENTO (a faixa de acentos é invisível no código)', () => {
    // se a faixa U+0300–U+036F se perder por corrupção de arquivo, estes quebram
    expect(gravidadePadrao(comp('Interior', 'Tapetes e forrações', 'Forração do porta-malas'))).toBe('leve')
    expect(gravidadePadrao(comp('Direção', 'Caixa', 'Setor'))).toBe('grave')
  })

  it('sem componente classificado cai em média, nunca em leve', () => {
    // "leve" faria a pendência não-classificada sumir do radar
    expect(gravidadePadrao(null)).toBe('media')
    expect(gravidadePadrao(undefined)).toBe('media')
    expect(gravidadePadrao(comp('Sistema Que Não Existe'))).toBe('media')
  })
})

describe('gravidade efetiva da pendência', () => {
  const mapa = new Map([['c1', comp('Interior', 'Tapetes e forrações', 'Tapete')]])

  it('o que foi gravado na pendência manda sobre o padrão', () => {
    // tapete pendurado no pedal é perigoso: a pessoa sobe a gravidade na mão
    expect(gravidadeDaPendencia({ gravidade: 'critica', componente_id: 'c1' }, mapa)).toBe('critica')
  })

  it('sem gravidade gravada, usa o padrão do componente', () => {
    expect(gravidadeDaPendencia({ componente_id: 'c1' }, mapa)).toBe('leve')
    expect(gravidadeDaPendencia({ gravidade: null, componente_id: 'c1' }, mapa)).toBe('leve')
  })

  it('valor inválido no banco não vira gravidade', () => {
    // migração aplicada errada, texto livre antigo, etc.
    expect(gravidadeDaPendencia({ gravidade: 'urgentíssimo', componente_id: 'c1' }, mapa)).toBe('leve')
    expect(gravidadeDaPendencia({ gravidade: '', componente_id: 'c1' }, mapa)).toBe('leve')
  })

  it('pendência antiga (sem componente e sem gravidade) continua classificada', () => {
    // é o que evita backfill: nada fica "sem gravidade" na tela
    expect(gravidadeDaPendencia({}, mapa)).toBe('media')
    expect(gravidadeDaPendencia({ componente_id: 'sumiu' }, mapa)).toBe('media')
  })
})

describe('placar por carro', () => {
  const mapa = new Map([
    ['freio', comp('Freios', 'Dianteiro', 'Pastilhas')],
    ['tapete', comp('Interior', 'Tapetes e forrações', 'Tapete')],
  ])

  it('conta cada gravidade e aponta a pior', () => {
    const c = contarPorGravidade(
      [
        { componente_id: 'tapete' },                      // leve
        { componente_id: 'tapete' },                      // leve
        { componente_id: 'freio' },                       // grave
        { gravidade: 'critica', componente_id: 'freio' }, // crítica
      ],
      mapa,
    )
    expect(c).toEqual({ leve: 2, media: 0, grave: 1, critica: 1, total: 4, pior: 'critica' })
  })

  it('carro sem pendência não tem "pior"', () => {
    expect(contarPorGravidade([], mapa)).toEqual({ leve: 0, media: 0, grave: 0, critica: 0, total: 0, pior: null })
  })

  it('a soma das gravidades é o total — nenhuma pendência escapa da conta', () => {
    const pends = [{}, { gravidade: 'leve' }, { componente_id: 'freio' }, { gravidade: 'lixo' }]
    const c = contarPorGravidade(pends, mapa)
    expect(c.leve + c.media + c.grave + c.critica).toBe(c.total)
    expect(c.total).toBe(pends.length)
  })

  it('sete leves não podem parecer pior que uma crítica', () => {
    // é a razão de existir da feature: hoje os dois carros mostram "7" e "1"
    const muitasLeves = contarPorGravidade(Array(7).fill({ gravidade: 'leve' }), mapa)
    const umaCritica = contarPorGravidade([{ gravidade: 'critica' }], mapa)
    expect(muitasLeves.total).toBeGreaterThan(umaCritica.total)
    expect(PESO[umaCritica.pior!]).toBeGreaterThan(PESO[muitasLeves.pior!])
  })
})

describe('ordenação e tabelas de apoio', () => {
  it('a mais urgente vem primeiro', () => {
    const ordenado = ordenarPorGravidade([
      { gravidade: 'leve' }, { gravidade: 'critica' }, { gravidade: 'media' }, { gravidade: 'grave' },
    ])
    expect(ordenado.map((p) => p.gravidade)).toEqual(['critica', 'grave', 'media', 'leve'])
  })

  it('toda gravidade tem rótulo, ajuda e cor — selo não pode sair em branco', () => {
    for (const g of GRAVIDADES) {
      expect(GRAVIDADE_LABEL[g], g).toBeTruthy()
      expect(GRAVIDADE_AJUDA[g], g).toBeTruthy()
      expect(GRAVIDADE_COR[g]?.bg, g).toMatch(/^#/)
      expect(PESO[g], g).toBeGreaterThan(0)
    }
  })

  it('ehGravidade só aceita os quatro valores', () => {
    expect(GRAVIDADES.every(ehGravidade)).toBe(true)
    for (const v of ['Leve', 'LEVE', 'urgente', '', null, undefined, 3]) {
      expect(ehGravidade(v), String(v)).toBe(false)
    }
  })
})
