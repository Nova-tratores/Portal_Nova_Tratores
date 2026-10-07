import { describe, it, expect } from 'vitest'
import {
  ALTURA_LINHA,
  FAIXA_DATA,
  LARGURA_COLUNA,
  MARGEM,
  RODAPE_ALTURA,
  dataExtenso,
  desenharBlocoAssinatura,
  desenharRodape,
  formatarDocumento,
  medirBlocoAssinatura,
  medirBlocoQueCabe,
  rotuloDocumento,
  validarDadosAssinatura,
  type PdfDoc,
} from '../pdf-assinatura'

// Doc falso: registra chamadas e quebra texto a ~1,9 mm por caractere a 9 pt
// (≈ Helvetica maiúscula/negrito), escalando com o tamanho da fonte.
const MM_POR_CHAR_9PT = 1.9
function docFalso() {
  const chamadas: { tipo: string; args: unknown[] }[] = []
  let paginas = 1
  let fonte = 9
  const mmPorChar = () => MM_POR_CHAR_9PT * fonte / 9
  const doc: PdfDoc & { chamadas: typeof chamadas } = {
    chamadas,
    setFont: (...a) => chamadas.push({ tipo: 'setFont', args: a }),
    setFontSize: (n) => { fonte = n; chamadas.push({ tipo: 'setFontSize', args: [n] }) },
    setTextColor: () => undefined,
    setDrawColor: () => undefined,
    setLineWidth: () => undefined,
    line: (...a) => chamadas.push({ tipo: 'line', args: a }),
    text: (...a) => chamadas.push({ tipo: 'text', args: a }),
    addPage: () => { paginas++; chamadas.push({ tipo: 'addPage', args: [] }) },
    getNumberOfPages: () => paginas,
    setPage: (...a) => chamadas.push({ tipo: 'setPage', args: a }),
    getTextWidth: (t) => t.length * mmPorChar(),
    splitTextToSize: (t, max) => {
      const porLinha = Math.max(1, Math.floor(max / mmPorChar()))
      const out: string[] = []
      let atual = ''
      for (const palavra of t.split(/\s+/)) {
        const cand = atual ? `${atual} ${palavra}` : palavra
        if (cand.length <= porLinha) atual = cand
        else { if (atual) out.push(atual); atual = palavra }
      }
      if (atual) out.push(atual)
      return out
    },
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  }
  return doc
}

const vendedorOk = { id: 3, nome: 'JOAQUIM FERNANDO LEME', carimbo_nome: 'Joaquim Fernando', carimbo_cargo: 'Departamento Comercial', carimbo_telefone: '(14) 9 9745-5617' }
const configOk = { razao_social: 'Nova Tratores Máquinas Agrícolas', cnpj: '31463139000103', ie: '537.054.605.110', endereco: 'Av. São Sebastião, 1065 - Jd Ana Cristina, Piraju - SP, 18800-770', telefone: '(14) 9 9745-5617' }
const propostaCurta = { id: 1234, Cliente: 'Ana Silla de Paula Bernardes', 'Cpf/Cpnj': '08231384000165', End_Entrega: 'Fazenda Iguaporã', Cidade: 'Piraju (SP)', criado_em: '2026-09-11T14:00:00-03:00' }
const propostaLonga = {
  id: 9999,
  Cliente: 'Cooperativa Agroindustrial dos Produtores Rurais do Vale do Paranapanema Ltda ME', // 80 chars
  'Cpf/Cpnj': '12345678000199',
  End_Entrega: 'Rodovia Geraldo M de Souza, SP-287, sentido Piraju/Manduri, km 41, s/n, Fazenda Iguaporã, Bairro dos Pires, caixa postal 12', // 120+ chars
  Cidade: 'Piraju (SP)',
  criado_em: '2026-09-11',
}

describe('formatarDocumento / rotuloDocumento', () => {
  it('formata CPF e CNPJ a partir de dígitos ou já formatado', () => {
    expect(formatarDocumento('08231384000165')).toBe('08.231.384/0001-65')
    expect(formatarDocumento('08.231.384/0001-65')).toBe('08.231.384/0001-65')
    expect(formatarDocumento('12345678901')).toBe('123.456.789-01')
    expect(rotuloDocumento('12345678901')).toBe('CPF')
    expect(rotuloDocumento('08231384000165')).toBe('CNPJ')
  })
  it('devolve como veio quando o tamanho não é CPF nem CNPJ', () => {
    expect(formatarDocumento(' 1234 ')).toBe('1234')
    expect(formatarDocumento(null)).toBe('')
    expect(rotuloDocumento('1234')).toBe('')
  })
})

describe('dataExtenso', () => {
  it('lê YYYY-MM-DD como data local', () => {
    expect(dataExtenso('2026-09-11')).toBe('Piraju (SP), 11 de setembro de 2026')
    expect(dataExtenso('2026-01-01')).toBe('Piraju (SP), 1 de janeiro de 2026')
  })
  it('aceita Date e ISO com fuso', () => {
    expect(dataExtenso(new Date(2026, 2, 5))).toBe('Piraju (SP), 5 de março de 2026')
    expect(dataExtenso('2026-09-11T14:00:00-03:00')).toMatch(/^Piraju \(SP\), 1[12] de setembro de 2026$/)
  })
  it('data inválida ou vazia cai em hoje (nunca "NaN de undefined")', () => {
    expect(dataExtenso('abc')).not.toMatch(/NaN|undefined/)
    expect(dataExtenso(null)).not.toMatch(/NaN|undefined/)
  })
})

describe('validarDadosAssinatura', () => {
  it('ok com tudo preenchido', () => {
    expect(validarDadosAssinatura(vendedorOk, configOk)).toEqual([])
  })
  it('sem vendedor → mensagem clara', () => {
    expect(validarDadosAssinatura(null, configOk)[0]).toMatch(/sem vendedor/i)
  })
  it('vendedor sem nome de carimbo → cita o nome e onde cadastrar', () => {
    const e = validarDadosAssinatura({ ...vendedorOk, carimbo_nome: '' }, configOk)
    expect(e).toHaveLength(1)
    expect(e[0]).toMatch(/JOAQUIM FERNANDO LEME sem nome de carimbo/)
    expect(e[0]).toMatch(/Carimbos/)
  })
  it('config ausente ou incompleta', () => {
    expect(validarDadosAssinatura(vendedorOk, null)[0]).toMatch(/Configuracoes/)
    expect(validarDadosAssinatura(vendedorOk, { razao_social: '', cnpj: '' })).toHaveLength(2)
  })
})

describe('medirBlocoAssinatura', () => {
  it('altura cresce com o nº de linhas quebradas', () => {
    const curta = medirBlocoAssinatura(docFalso(), { proposta: propostaCurta, vendedor: vendedorOk, config: configOk })
    const longa = medirBlocoAssinatura(docFalso(), { proposta: propostaLonga, vendedor: vendedorOk, config: configOk })
    expect(curta.esquerda.length).toBe(5)
    expect(longa.esquerda.length).toBeGreaterThan(7)
    expect(longa.altura).toBe(FAIXA_DATA + longa.esquerda.length * ALTURA_LINHA)
    expect(longa.altura).toBeGreaterThan(curta.altura)
  })
  it('caso típico (endereço de 80 chars em maiúsculas) cabe na 1ª página a partir de y=248, em 9 pt', () => {
    const doc = docFalso()
    const tipica = { ...propostaCurta, End_Entrega: 'VIA GERALDO M DE SOUZA, SP287 SENTIDO PIRAJU/MANDURI, KM41, S/N - FAZENDA IGUAPORÃ' }
    desenharBlocoAssinatura(doc, { proposta: tipica, vendedor: vendedorOk, config: configOk, y: 248 })
    expect(doc.chamadas.some(c => c.tipo === 'addPage')).toBe(false)
    const fontes = doc.chamadas.filter(c => c.tipo === 'setFontSize').map(c => c.args[0] as number)
    expect(Math.min(...fontes)).toBe(9)
  })
  it('fallback de fonte: 9 pt quando cabe; 8,5/8 quando não; página nova só se nem 8 couber', () => {
    const args = { proposta: propostaCurta, vendedor: vendedorOk, config: configOk }
    const a9 = medirBlocoAssinatura(docFalso(), { ...args, fonte: 9 })
    // folga de sobra → 9 pt
    expect(medirBlocoQueCabe(docFalso(), args, 100, 287)).toMatchObject({ fonte: 9, cabe: true })
    // limite 1 mm abaixo do que 9 pt precisa → encolhe (8,5 ou 8), sem página nova
    const apertado = medirBlocoQueCabe(docFalso(), args, 287 - a9.altura + 1, 287)
    expect(apertado.cabe).toBe(true)
    expect(apertado.fonte).toBeLessThan(9)
    // nem 8 pt cabe → cabe=false e medida volta a 9 pt (vai pra página nova)
    expect(medirBlocoQueCabe(docFalso(), args, 280, 287)).toMatchObject({ fonte: 9, cabe: false })
    // desenho: no caso apertado a fonte usada é a reduzida e não há addPage
    const doc = docFalso()
    desenharBlocoAssinatura(doc, { ...args, y: 287 - a9.altura + 1 })
    expect(doc.chamadas.some(c => c.tipo === 'addPage')).toBe(false)
    const fontes = doc.chamadas.filter(c => c.tipo === 'setFontSize').map(c => c.args[0] as number)
    expect(Math.min(...fontes)).toBeLessThan(9)
    expect(Math.min(...fontes)).toBeGreaterThanOrEqual(8)
  })
  it('linha vazia (sem endereço) some em vez de deixar buraco', () => {
    const m = medirBlocoAssinatura(docFalso(), { proposta: { ...propostaCurta, End_Entrega: '' }, vendedor: vendedorOk, config: configOk })
    expect(m.esquerda.length).toBe(4)
  })
})

describe('desenharBlocoAssinatura', () => {
  const textos = (doc: ReturnType<typeof docFalso>) => doc.chamadas.filter(c => c.tipo === 'text')

  it('lança com mensagem (não exceção anônima) quando vendedor = null', () => {
    expect(() => desenharBlocoAssinatura(docFalso(), { proposta: propostaCurta, vendedor: null, config: configOk, y: 248 }))
      .toThrow(/sem vendedor/i)
  })

  it('proposta curta cabe na 1ª página, com as duas linhas na mesma altura', () => {
    const doc = docFalso()
    const fim = desenharBlocoAssinatura(doc, { proposta: propostaCurta, vendedor: vendedorOk, config: configOk, y: 248 })
    expect(doc.chamadas.some(c => c.tipo === 'addPage')).toBe(false)
    const linhas = doc.chamadas.filter(c => c.tipo === 'line')
    expect(linhas).toHaveLength(2)
    expect(linhas[0].args[1]).toBe(linhas[1].args[1])
    expect(fim).toBeLessThanOrEqual(297 - RODAPE_ALTURA)
    // linha da direita dentro da coluna do vendedor
    expect(linhas[1].args[0]).toBe(210 - MARGEM - LARGURA_COLUNA)
    expect(linhas[1].args[2]).toBe(210 - MARGEM)
    // a data fica ACIMA das linhas
    const data = doc.chamadas.find(c => c.tipo === 'text' && String(c.args[0]).startsWith('Piraju (SP),'))!
    expect(data.args[2] as number).toBeLessThan(linhas[0].args[1] as number)
  })

  it('cliente 60+ e endereço 100+ chars: nenhuma linha passa da coluna e o bloco vai pra página nova se não couber', () => {
    const doc = docFalso()
    // 10 linhas a partir de 262 não cabem nem a 8 pt → página nova
    desenharBlocoAssinatura(doc, { proposta: propostaLonga, vendedor: vendedorOk, config: configOk, y: 262 })
    expect(doc.chamadas.some(c => c.tipo === 'addPage')).toBe(true)
    for (const t of textos(doc)) {
      const [txt, x, , opts] = t.args as [string, number, number, { align?: string } | undefined]
      const largura = doc.getTextWidth(txt)
      if (opts?.align === 'center') {
        expect(x - largura / 2).toBeGreaterThanOrEqual(MARGEM - 0.01)
        expect(x + largura / 2).toBeLessThanOrEqual(210 - MARGEM + 0.01)
      }
    }
    // o cliente e o endereço aparecem inteiros (só quebrados), em maiúsculas o cliente
    const juntos = textos(doc).map(t => String(t.args[0])).join(' ')
    expect(juntos).toContain(propostaLonga.Cliente.toUpperCase())
    expect(juntos).toContain(propostaLonga.End_Entrega)
    expect(juntos).toContain('CNPJ: 12.345.678/0001-99')
    expect(juntos).toContain('Piraju (SP), 11 de setembro de 2026')
  })

  it('nenhum texto sobrepõe outro: baselines distintas por coluna, espaçadas ALTURA_LINHA', () => {
    const doc = docFalso()
    desenharBlocoAssinatura(doc, { proposta: propostaLonga, vendedor: vendedorOk, config: configOk, y: 100 })
    const porX = new Map<number, number[]>()
    for (const t of textos(doc)) {
      const [, x, y, opts] = t.args as [string, number, number, { align?: string } | undefined]
      if (opts?.align !== 'center') continue
      porX.set(x, [...(porX.get(x) ?? []), y])
    }
    expect(porX.size).toBe(2)
    for (const ys of porX.values()) {
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeCloseTo(ALTURA_LINHA, 5)   // y=100: sobra espaço, fica em 9 pt
    }
  })

  it('cargo e telefone viram uma linha "cargo — telefone"; sem cargo fica só o telefone', () => {
    const doc = docFalso()
    desenharBlocoAssinatura(doc, { proposta: propostaCurta, vendedor: vendedorOk, config: configOk, y: 100 })
    expect(textos(doc).map(t => t.args[0]).join(' ')).toContain('Departamento Comercial — (14) 9 9745-5617')
    const doc2 = docFalso()
    desenharBlocoAssinatura(doc2, { proposta: propostaCurta, vendedor: { ...vendedorOk, carimbo_cargo: null }, config: configOk, y: 100 })
    expect(textos(doc2).map(t => t.args[0])).toContain('(14) 9 9745-5617')
  })
})

describe('desenharRodape', () => {
  it('escreve em todas as páginas com N de M e os dados da empresa', () => {
    const doc = docFalso()
    doc.addPage(); doc.addPage()
    desenharRodape(doc, { config: configOk, propostaId: 1234 })
    const paginas = doc.chamadas.filter(c => c.tipo === 'setPage').map(c => c.args[0])
    expect(paginas).toEqual([1, 2, 3])
    const textos = doc.chamadas.filter(c => c.tipo === 'text').map(c => String(c.args[0]))
    expect(textos).toContain('Proposta nº 1234 — página 1 de 3')
    expect(textos).toContain('Proposta nº 1234 — página 3 de 3')
    const esquerda = textos.filter(t => !t.startsWith('Proposta nº')).join(' ')
    expect(esquerda).not.toContain('Nova Tratores Máquinas Agrícolas')   // razão social fica na coluna do vendedor
    expect(esquerda).toContain('I.E.: 537.054.605.110')
    expect(esquerda).toContain('Tel.: (14) 9 9745-5617')
    expect(esquerda).toContain('Av. São Sebastião')
  })
  it('config nula não derruba (rodapé só com nº da proposta)', () => {
    const doc = docFalso()
    expect(() => desenharRodape(doc, { config: null, propostaId: null })).not.toThrow()
    expect(doc.chamadas.filter(c => c.tipo === 'text').map(c => c.args[0])).toContain('Proposta nº — — página 1 de 1')
  })
})
