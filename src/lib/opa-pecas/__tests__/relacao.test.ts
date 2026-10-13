import { describe, expect, it } from 'vitest'
import { acharCadastros, chaveCodigo, codigoDoItem, semEntidades, gerarCsvRelacao, indexarCadastros, locacaoDe, montarRelacao, outrasCaracteristicas, tipoDe, variantesCodigo, type ItemRelacao } from '../relacao'

const item = (p: Partial<ItemRelacao>): ItemRelacao => ({
  id: 'i', codigo: 'CAP-000001', codigo_fabricante: null, descricao: 'Peça', quantidade: 1, qualidade: 'nova',
  status: 'aguardando_identificacao', local_id: null, local_tecnico: null, preco_sugerido: null, criado_em: '2026-10-09T10:00:00Z', ...p,
})

describe('relação Opa × cadastro', () => {
  it('normaliza e gera grafias com e sem RP-', () => {
    expect(chaveCodigo(' b0471 654 ')).toBe('B0471654')
    expect(variantesCodigo('0734309419')).toEqual(['0734309419', 'RP-0734309419'])
    expect(variantesCodigo('rp-0734309419')).toEqual(['RP-0734309419', '0734309419'])
    expect(variantesCodigo('')).toEqual([])
    // texto a mais depois do código: cada pedaço também é procurado
    expect(variantesCodigo('Y8401970 GK')).toEqual(['Y8401970GK', 'RP-Y8401970GK', 'Y8401970', 'RP-Y8401970'])
  })

  it('limpa entidades HTML da descrição da Omie', () => {
    expect(semEntidades('MANGOTE 2&quot; RETO &amp; CIA')).toBe('MANGOTE 2" RETO & CIA')
  })

  it('lê tipo e locação das características do PPV', () => {
    expect(tipoDe({ 'Tipo:': 'Mangote' })).toBe('Mangote')
    expect(locacaoDe({ '#PRATELEIRA': '23', '#ANDAR': 'A', '#CAIXA': '06' })).toBe('23 · A · 06')
    expect(locacaoDe({ '#PRATELEIRA': '23' })).toBe('23 · — · —')
    expect(locacaoDe({ 'Tipo:': 'X' })).toBeNull()
    expect(locacaoDe({ '#PRATELEIRA': '#N/D' })).toBeNull()
    // como a tela de Localização: #ANDAR2/#CAIXA2 de reserva, caixa/acento não importam, XXX/000 = vazio
    expect(locacaoDe({ '#Prateleira': '5', '#ANDAR2': 'B', '#CAIXA2': '02' })).toBe('5 · B · 02')
    expect(locacaoDe({ '#PRATELEIRA': 'XXX', '#ANDAR': '000' })).toBeNull()
    expect(outrasCaracteristicas({ '#ANDAR2': 'B', 'Sistema': 'Hidráulico' })).toEqual([{ nome: 'Sistema', valor: 'Hidráulico' }])
  })

  it('separa as filas e junta as duas empresas', () => {
    const r = montarRelacao(
      [
        item({ id: 'a', codigo_fabricante: 'b0471654' }),
        item({ id: 'b', codigo_fabricante: '0734309419' }),
        item({ id: 'c', codigo_fabricante: 'GK' }),
        item({ id: 'd', codigo_fabricante: null }),
      ],
      [
        { conta_omie: 'nova', codigo: 'B0471654', descricao: 'MANGOTE', estoque: 2, valor_unitario: 10.5, marca: 'KUHN', familia_nome: 'Peças', inativo: false },
        { conta_omie: 'castro', codigo: 'B0471654', descricao: 'MANGOTE', estoque: 0, valor_unitario: 11, marca: 'KUHN', familia_nome: 'Peças', inativo: false },
      ],
      [
        { conta_omie: 'NOVA', codigo: 'B0471654', descricao: 'MANGOTE', caracteristicas: { 'Tipo:': 'Mangote', '#PRATELEIRA': '3', '#ANDAR': 'G', '#CAIXA': '1' } },
        { conta_omie: 'NOVA', codigo: 'RP-0734309419', descricao: 'FILTRO', caracteristicas: {} },
      ],
    )
    expect(r.existentes.map((l) => l.item.id)).toEqual(['a', 'b'])
    expect(r.existentes[0].cadastros.map((c) => c.empresa)).toEqual(['NOVA', 'CASTRO'])
    expect(r.existentes[0].cadastros[0]).toMatchObject({ tipo: 'Mangote', locacao: '3 · G · 1', estoque: 2 })
    expect(r.existentes[1].cadastros[0].codigo).toBe('RP-0734309419')
    expect(r.soOpa.map((l) => [l.item.id, l.motivo])).toEqual([['c', 'nao_encontrado'], ['d', 'sem_codigo']])

    const csv = gerarCsvRelacao(r, () => 'Pós-Vendas · Térreo').split('\r\n')
    expect(csv).toHaveLength(1 + 2 + 1 + 2 + 1) // cabeçalho + (a×2 empresas) + b + (c, d) + linha vazia final
    expect(csv[1]).toContain('Já cadastrado;CAP-000001;b0471654')
    expect(csv[1]).toContain('NOVA;B0471654;MANGOTE;Mangote;3 · G · 1;2;10,50')
    expect(csv[4]).toContain('Só no Opa (código não cadastrado)')
  })

  it('embalagem errada: acha o produto pelo código correto e mostra as outras características', () => {
    expect(codigoDoItem({ codigo_fabricante: 'ERRADO-1', codigo_correto: ' B0471654 ' })).toBe('B0471654')
    expect(codigoDoItem({ codigo_fabricante: 'X1', codigo_correto: null })).toBe('X1')
    expect(codigoDoItem({ codigo_fabricante: null })).toBeNull()

    expect(outrasCaracteristicas({ 'Tipo:': 'Mangote', '#PRATELEIRA': '3', 'Aplicação:': '6075E', 'Material:': '-', '#Cor': 'Preto' }))
      .toEqual([{ nome: 'Aplicação', valor: '6075E' }, { nome: 'Cor', valor: 'Preto' }])

    const r = montarRelacao(
      [item({ id: 'a', codigo_fabricante: 'ERRADO-1', codigo_correto: 'b0471654' })],
      [{ conta_omie: 'nova', codigo: 'B0471654', descricao: 'MANGOTE', estoque: 2, valor_unitario: 10.5, marca: null, familia_nome: null, inativo: false }],
      [{ conta_omie: 'NOVA', codigo: 'B0471654', descricao: 'MANGOTE', caracteristicas: { 'Aplicação:': '6075E' } }],
    )
    expect(r.existentes).toHaveLength(1)
    expect(r.existentes[0].cadastros[0].outras).toEqual([{ nome: 'Aplicação', valor: '6075E' }])
    const csv = gerarCsvRelacao(r, () => '').split('\r\n')
    expect(csv[1]).toContain('ERRADO-1;b0471654;Peça')
    expect(csv[1].endsWith('Aplicação: 6075E')).toBe(true)
  })

  it('acharCadastros procura com e sem RP- nas duas empresas', () => {
    const cad = indexarCadastros(
      [{ conta_omie: 'castro', codigo: 'RP-0734309419', descricao: 'FILTRO', estoque: 1, valor_unitario: 5, marca: null, familia_nome: null, inativo: false }],
      [],
    )
    expect(acharCadastros(cad, '0734309419').map((c) => [c.empresa, c.codigo])).toEqual([['CASTRO', 'RP-0734309419']])
    expect(acharCadastros(cad, 'nada')).toEqual([])
  })
})
