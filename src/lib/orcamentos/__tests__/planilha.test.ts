import { describe, expect, it } from 'vitest'
import {
  colunaDeCodigoPeloCadastro, colunasCodigoNumerico, detectarColunas, ehBloco, formatarMoedaBR, lerColagem, linhasDaColagem, margem, paraExcel, parseNumeroBR,
} from '../planilha'

const colar = (t: string) => { const g = lerColagem(t); const d = detectarColunas(g); return { d, linhas: linhasDaColagem(g, d) } }

describe('parseNumeroBR', () => {
  it('lê os formatos que aparecem na planilha', () => {
    expect(parseNumeroBR('1.290,00')).toBe(1290)
    expect(parseNumeroBR('R$ 33,40')).toBe(33.4)
    expect(parseNumeroBR('1290')).toBe(1290)
    expect(parseNumeroBR('1290.5')).toBe(1290.5)
    expect(parseNumeroBR('33.40')).toBe(33.4)
    expect(parseNumeroBR('1.290')).toBe(1290)
    expect(parseNumeroBR('0.500')).toBe(0.5)
    expect(parseNumeroBR('1,5')).toBe(1.5)
    expect(parseNumeroBR('1,290.00')).toBe(1290)
    expect(parseNumeroBR('12.345.678,9')).toBe(12345678.9)
    expect(parseNumeroBR('-10,00')).toBe(-10)
  })
  it('texto não é número', () => {
    expect(parseNumeroBR('')).toBeNull()
    expect(parseNumeroBR('FILTRO')).toBeNull()
    expect(parseNumeroBR('RP-0060')).toBeNull()
  })
})

describe('colagem do Excel', () => {
  it('com cabeçalho, em qualquer ordem', () => {
    const { d, linhas } = colar('DESCRIÇÃO\tCÓDIGO\tQTD\tVALOR UNIT\tTOTAL\r\nFILTRO AR EXTERNO\tRA-101854\t2\t1.290,00\t2.580,00\r\nSILICONE CINZA\tHS112CINZA\t1\t35,00\t35,00\r\n')
    expect(d.cabecalho).toBe(true)
    expect(d.mapa).toEqual(['descricao', 'codigo', 'quantidade', 'preco', 'total'])
    expect(linhas).toEqual([
      { codigo: 'RA-101854', descricao: 'FILTRO AR EXTERNO', quantidade: 2, preco: 1290 },
      { codigo: 'HS112CINZA', descricao: 'SILICONE CINZA', quantidade: 1, preco: 35 },
    ])
  })

  it('sem cabeçalho: descobre pelo conteúdo', () => {
    const { d, linhas } = colar('RA-101854\tFILTRO AR EXTERNO\t2\t1.290,00\nHS112CINZA\tSILICONE CINZA OU PRETO\t1\t35,00\n827265\tCOLA 334 ROXA\t3\t60,00')
    expect(d.cabecalho).toBe(false)
    expect(d.mapa).toEqual(['codigo', 'descricao', 'quantidade', 'preco'])
    expect(linhas[2]).toEqual({ codigo: '827265', descricao: 'COLA 334 ROXA', quantidade: 3, preco: 60 })
  })

  it('qtd × unitário = total, mesmo com quantidade 1 em quase tudo', () => {
    const { d } = colar('0734309423\tRETENTOR GRANDE ZF\t1\t202,00\t202,00\nRP-006034348U1\tFILTRO DE COMBUSTIVEL\t1\t250,00\t250,00\nRP-000016115P04\tFILTRO OLEO TRANSMISSAO\t2\t90,00\t180,00')
    expect(d.mapa).toEqual(['codigo', 'descricao', 'quantidade', 'preco', 'total'])
  })

  it('sem unitário, só total: calcula o unitário', () => {
    const { linhas } = colar('Código\tDescrição\tQtd\tTotal\nRA-101854\tFiltro\t4\t100,00')
    expect(linhas[0].preco).toBe(25)
  })

  it('sem quantidade vira 1; linha sem código nem descrição sai', () => {
    const { linhas } = colar('RA-101854\tFILTRO AR EXTERNO\t1.290,00\n\t\t\nHS112CINZA\tSILICONE\t35,00')
    expect(linhas).toEqual([
      { codigo: 'RA-101854', descricao: 'FILTRO AR EXTERNO', quantidade: 1, preco: 1290 },
      { codigo: 'HS112CINZA', descricao: 'SILICONE', quantidade: 1, preco: 35 },
    ])
  })

  it('coluna vazia no meio é ignorada', () => {
    const g = lerColagem('RA-101854\t\tFILTRO AR\t2\nHS112CINZA\t\tSILICONE\t1')
    expect(g[0]).toEqual(['RA-101854', 'FILTRO AR', '2'])
  })

  it('uma célula só não é bloco', () => {
    expect(ehBloco('RA-101854')).toBe(false)
    expect(ehBloco('RA-101854\n')).toBe(false)
    expect(ehBloco('RA-101854\tFILTRO')).toBe(true)
    expect(ehBloco('1\n2')).toBe(true)
  })
})

describe('de volta para o Excel e margem', () => {
  it('monta TAB + números BR', () => {
    const t = paraExcel([{ codigo: 'RA-1', descricao: 'Filtro', quantidade: 2, preco: 1290 }, { codigo: '', descricao: '', quantidade: 1, preco: 0 }])
    expect(t).toBe(`Código\tDescrição\tQtd\tUnitário\tTotal\r\nRA-1\tFiltro\t2\t${formatarMoedaBR(1290)}\t${formatarMoedaBR(2580)}`)
  })
  it('margem sobre o preço', () => {
    expect(margem(100, 60)).toBeCloseTo(0.4)
    expect(margem(456.19, 559)).toBeLessThan(0)
    expect(margem(100, null)).toBeNull()
  })
})

describe('código curto só de números', () => {
  const grade = lerColagem('1264\tRESERVATORIO\t1\t168,00\n4410\tTAMPA DO RADIADOR\t2\t45,00')
  it('sem o cadastro parece preço; o cadastro reconhece e a coluna vira Código', () => {
    const det = detectarColunas(grade)
    expect(det.mapa.includes('codigo')).toBe(false)
    const cand = colunasCodigoNumerico(grade, det)
    expect(cand).toContain(0)
    const col = colunaDeCodigoPeloCadastro(grade, cand, (v) => v === '1264' || v === '4410')
    expect(col).toBe(0)
    const linhas = linhasDaColagem(grade, detectarColunas(grade, col!))
    expect(linhas[0]).toEqual({ codigo: '1264', descricao: 'RESERVATORIO', quantidade: 1, preco: 168 })
    expect(linhas[1]).toEqual({ codigo: '4410', descricao: 'TAMPA DO RADIADOR', quantidade: 2, preco: 45 })
  })
  it('cadastro não reconhece: fica como estava', () => {
    expect(colunaDeCodigoPeloCadastro(grade, [0, 2], () => false)).toBeNull()
  })
})
