import { describe, expect, it } from 'vitest'
import { MOTIVOS_SAIDA } from '../../ppv/constants'
import {
  destinoTemPpv,
  escolherPpvAberto,
  linhaMovimentacao,
  MOTIVO_SAIDA_POR_DESTINO,
  novoIdMovimentacao,
  observacaoPpvRastreio,
  ondeFoiParar,
  ppvAceitaItem,
  ppvsDaOS,
  variantesDeCodigo,
} from '../os-ppv-regras'

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

describe('destinos que viram linha de pedido', () => {
  it('OS, balcão e uso interno entram; o resto não', () => {
    expect(destinoTemPpv('os')).toBe(true)
    expect(destinoTemPpv('balcao')).toBe(true)
    expect(destinoTemPpv('uso_interno')).toBe(true)
    // 'ppv' fica de fora de propósito: lá a peça já foi escaneada DENTRO do
    // pedido — lançar de novo duplicaria o item
    expect(destinoTemPpv('ppv')).toBe(false)
    expect(destinoTemPpv(null)).toBe(false)
    expect(destinoTemPpv('')).toBe(false)
  })

  it('todo motivo de saída usado é um que o select do PPV conhece', () => {
    // inventar um motivo ("Uso interno") criaria pedido com valor fora da
    // lista: abrir o pedido na tela apagaria o campo silenciosamente
    const validos = MOTIVOS_SAIDA.map((m) => m.value)
    for (const [destino, motivo] of Object.entries(MOTIVO_SAIDA_POR_DESTINO)) {
      expect(validos, `motivo de ${destino}`).toContain(motivo)
    }
  })

  it('a observação diz de onde o pedido veio', () => {
    expect(observacaoPpvRastreio('os', 'OS-0123')).toContain('OS-0123')
    expect(observacaoPpvRastreio('balcao')).toContain('venda balcão')
    expect(observacaoPpvRastreio('uso_interno')).toContain('uso interno')
    for (const d of ['os', 'balcao', 'uso_interno'] as const) {
      expect(observacaoPpvRastreio(d), d).toContain('rastreio de peças (QR)')
    }
  })

  it('o id da OS já vem com prefixo — a frase não pode ficar gaga', () => {
    expect(ondeFoiParar('os', 'OS-0123')).toBe('para a OS-0123')
    expect(ondeFoiParar('os', 'OS-0123')).not.toContain('OS OS-')
    // id sem prefixo (dado antigo) ainda ganha o "OS"
    expect(ondeFoiParar('os', '0123')).toBe('para a OS 0123')
  })

  it('OS sem número não deixa a frase pendurada nem com "undefined"', () => {
    for (const ref of [null, undefined, '', '   ']) {
      const frase = observacaoPpvRastreio('os', ref)
      expect(frase, String(ref)).not.toMatch(/undefined|null/)
      expect(frase, String(ref)).not.toMatch(/\bOS\s*$/)
      expect(frase, String(ref)).toContain('ordem de serviço')
    }
  })
})

describe('linha de item do pedido (movimentacoes)', () => {
  const linha = (over = {}) => linhaMovimentacao({
    ppv: 'PPV-0434', codigo: 'RP-007206155C91', descricao: 'BOMBA HIDRAULICA TANDEM',
    preco: 3700, tecnico: 'VINICIUS CORREA', dataHora: '26/08/2026 18:41', id: 1234567890, ...over,
  })

  it('SEMPRE leva Id — a coluna é NOT NULL sem default', () => {
    // sem isto o insert morre com 23502 e a peça some do pedido sem ninguém
    // ver: foi exatamente o que deixou o PPV-0434 vazio em 26/08/2026
    const l = linha()
    expect(l).toHaveProperty('Id')
    expect(l.Id).toBe(1234567890)
    expect(typeof l.Id).toBe('number')
  })

  it('o id sorteado tem 10 dígitos, como os do módulo', () => {
    for (const s of [0, 0.5, 0.999999]) {
      const id = novoIdMovimentacao(s)
      expect(id, String(s)).toBeGreaterThanOrEqual(1_000_000_000)
      expect(id, String(s)).toBeLessThan(10_000_000_000)
      expect(Number.isInteger(id), String(s)).toBe(true)
    }
  })

  it('sai como saída de 1 unidade com o preço encontrado', () => {
    const l = linha()
    expect(l.TipoMovimento).toBe('Saída')
    expect(l.Qtde).toBe('1')
    expect(l.Preco).toBe(3700)
    expect(l.Id_PPV).toBe('PPV-0434')
    expect(l.CodProduto).toBe('RP-007206155C91')
  })

  it('peça sem descrição cai no código — nunca linha em branco no pedido', () => {
    expect(linha({ descricao: null }).Descricao).toBe('RP-007206155C91')
    expect(linha({ descricao: '' }).Descricao).toBe('RP-007206155C91')
  })
})

describe('pedido ainda aceita item?', () => {
  const cab = (over: Partial<Parameters<typeof ppvAceitaItem>[0]> = {}) => ({
    status: 'Aguardando Para Faturar', Tipo_Pedido: 'Pedido',
    pedido_omie: null, faturado_omie_em: null, ...over,
  })

  it('pedido aberto aceita', () => {
    expect(ppvAceitaItem(cab())).toBe(true)
  })

  it('faturado não aceita — seria peça vendida sem nota', () => {
    expect(ppvAceitaItem(cab({ faturado_omie_em: '2026-08-20T10:00:00Z' }))).toBe(false)
  })

  it('remessa já enviada ao Omie conta como fechada', () => {
    expect(ppvAceitaItem(cab({ Tipo_Pedido: 'Remessa', pedido_omie: '4321' }))).toBe(false)
    // remessa ainda não enviada segue aberta
    expect(ppvAceitaItem(cab({ Tipo_Pedido: 'Remessa' }))).toBe(true)
  })

  it('status terminal não aceita (inclusive os nomes legados)', () => {
    for (const s of ['Concluída', 'Cancelada', 'Fechado', 'Cancelado']) {
      expect(ppvAceitaItem(cab({ status: s })), s).toBe(false)
    }
  })

  it('concorda com escolherPpvAberto — as duas réguas não podem divergir', () => {
    // escolherPpvAberto decide o pedido da OS; ppvAceitaItem valida o que a
    // pessoa apontou no balcão. Se discordassem, o mesmo pedido seria aceito
    // num caminho e recusado no outro.
    const casos = [
      cab(),
      cab({ faturado_omie_em: '2026-08-20T10:00:00Z' }),
      cab({ status: 'Cancelada' }),
      cab({ Tipo_Pedido: 'Remessa', pedido_omie: '4321' }),
    ]
    for (const c of casos) {
      const faturado = !!c.faturado_omie_em || (c.Tipo_Pedido === 'Remessa' && !!c.pedido_omie)
      const viaOS = escolherPpvAberto(['PPV-0001'], st([['PPV-0001', c.status, faturado]]))
      expect(!!viaOS, JSON.stringify(c)).toBe(ppvAceitaItem(c))
    }
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
