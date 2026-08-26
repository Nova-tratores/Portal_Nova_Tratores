import { describe, expect, it } from 'vitest'
import { escolherPpvAberto, ppvsDaOS, variantesDeCodigo } from '../os-ppv-regras'

const st = (pares: [string, string | null, boolean][]) =>
  new Map(pares.map(([id, status, faturado]) => [id, { status, faturado }]))

describe('PPV que recebe a peça liberada', () => {
  it('usa o pedido aberto da OS', () => {
    expect(escolherPpvAberto(['PPV-0010'], st([['PPV-0010', 'Em Andamento', false]]))).toBe('PPV-0010')
  })

  it('NUNCA acrescenta em pedido já faturado', () => {
    // seria peça vendida sem nota — o erro oposto ao que a função evita
    expect(escolherPpvAberto(['PPV-0010'], st([['PPV-0010', 'Em Andamento', true]]))).toBeNull()
  })

  it('nem em pedido cancelado ou concluído (inclusive os nomes legados)', () => {
    for (const terminal of ['Concluída', 'Cancelada', 'Fechado', 'Cancelado']) {
      expect(escolherPpvAberto(['PPV-0010'], st([['PPV-0010', terminal, false]])), terminal).toBeNull()
    }
  })

  it('com vários, pega o primeiro que ainda está aberto', () => {
    const mapa = st([
      ['PPV-0010', 'Em Andamento', true],   // já faturado
      ['PPV-0011', 'Cancelada', false],     // cancelado
      ['PPV-0012', 'Em Andamento', false],  // este
    ])
    expect(escolherPpvAberto(['PPV-0010', 'PPV-0011', 'PPV-0012'], mapa)).toBe('PPV-0012')
  })

  it('PPV citado na OS que não existe mais é ignorado', () => {
    expect(escolherPpvAberto(['PPV-9999'], st([]))).toBeNull()
  })

  it('sem nenhum aberto devolve null (o chamador cria um novo)', () => {
    expect(escolherPpvAberto([], st([]))).toBeNull()
  })
})

describe('leitura do vínculo OS → PPV', () => {
  it('a coluna é CSV e vem com espaços', () => {
    expect(ppvsDaOS('PPV-0010, PPV-0011 ,PPV-0012')).toEqual(['PPV-0010', 'PPV-0011', 'PPV-0012'])
  })

  it('vazio, nulo e lixo não viram pedido fantasma', () => {
    expect(ppvsDaOS(null)).toEqual([])
    expect(ppvsDaOS('')).toEqual([])
    expect(ppvsDaOS(' , , ')).toEqual([])
  })
})

describe('preço: variantes do código', () => {
  it('procura com e sem o prefixo RP-', () => {
    expect(variantesDeCodigo('RP-006517047Y1')).toEqual(['RP-006517047Y1', '006517047Y1'])
    expect(variantesDeCodigo('006517047Y1')).toEqual(['006517047Y1', 'RP-006517047Y1'])
  })

  it('não duplica quando as variantes coincidem', () => {
    expect(new Set(variantesDeCodigo('RA-107372')).size).toBe(variantesDeCodigo('RA-107372').length)
  })

  it('código vazio não vira busca', () => {
    expect(variantesDeCodigo('')).toEqual([])
    expect(variantesDeCodigo('   ')).toEqual([])
  })
})
