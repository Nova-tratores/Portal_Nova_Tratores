import { describe, expect, it } from 'vitest'
import { FORM_VAZIO, filtrarItens, juntarTags, lerValor, limparTag, mudouOnde, textoOnde, totais, validarForm, type ItemPat } from '../tipos'
import { caminhoFotoValido } from '../fotos-regra'

const item = (p: Partial<ItemPat>): ItemPat => ({
  id: 'i', codigo: 'PAT-000001', quantidade: 1, descricao: 'Parafusadeira', categoria: 'Ferramenta elétrica', marca: 'Bosch', modelo: 'GSR 12V-15',
  numero_serie: null, estado: 'bom', situacao: 'em_uso', local_id: 'pecas', local_tecnico: null, responsavel: null,
  valor_atual: null, valor_compra: null, data_compra: null, fornecedor: null, nota_fiscal: null, garantia_ate: null,
  tags: [], observacoes: null, criado_por: null, criado_em: '2026-10-13T10:00:00Z', atualizado_em: '2026-10-13T10:00:00Z', fotos: [], ...p,
})

describe('patrimônio — regras', () => {
  it('lê valor em reais nos dois formatos', () => {
    expect(lerValor('1.234,56')).toBe(1234.56)
    expect(lerValor('R$ 300')).toBe(300)
    expect(lerValor('99.9')).toBe(99.9)
    expect(lerValor('')).toBeNull()
    expect(lerValor('abc')).toBeNaN()
    expect(lerValor('-5')).toBeNaN()
  })

  it('tags: limpa, junta sem repetir, separa por vírgula', () => {
    expect(limparTag('  #Tecnologia ')).toBe('tecnologia')
    expect(juntarTags(['oficina'], 'Tecnologia, oficina; empréstimo')).toEqual(['oficina', 'tecnologia', 'empréstimo'])
  })

  it('valida obrigatórios e converte', () => {
    expect(validarForm(FORM_VAZIO).erros).toEqual(['a descrição', 'onde está'])
    const { erros, dados } = validarForm({ ...FORM_VAZIO, descricao: ' Notebook ', local_id: 'pos_vendas', valor_atual: '2.500,00', tags: ['TI '] })
    expect(erros).toEqual([])
    expect(dados).toMatchObject({ descricao: 'Notebook', local_id: 'pos_vendas', valor_atual: 2500, valor_compra: null, tags: ['ti'], marca: null })
    expect(validarForm({ ...FORM_VAZIO, descricao: 'x', local_id: 'a', valor_compra: 'mil' }).erros).toEqual(['o valor de compra (número inválido)'])
    expect(dados.quantidade).toBe(1)
    expect(validarForm({ ...FORM_VAZIO, descricao: 'x', local_id: 'a', quantidade: '12' }).dados.quantidade).toBe(12)
    expect(validarForm({ ...FORM_VAZIO, descricao: 'x', local_id: 'a', quantidade: '0' }).erros.length).toBe(1)
  })

  it('filtra por texto (sem acento), local, estado e tag', () => {
    const itens = [
      item({ id: 'a', tags: ['tecnologia'], descricao: 'Notebook Dell', categoria: 'Informática' }),
      item({ id: 'b', estado: 'ruim', local_id: 'box_tecnico', local_tecnico: 'Gabriel', responsavel: 'Gabriel' }),
    ]
    const nome = (id: string) => ({ pecas: 'Peças', box_tecnico: 'Box Técnico' }[id] || id)
    expect(filtrarItens(itens, { texto: 'notebook', categoria: '', local: '', estado: '', tag: '' }, nome).map((i) => i.id)).toEqual(['a'])
    expect(filtrarItens(itens, { texto: 'tecnico gabriel', categoria: '', local: '', estado: '', tag: '' }, nome).map((i) => i.id)).toEqual(['b'])
    expect(filtrarItens(itens, { texto: '', categoria: '', local: '', estado: 'ruim', tag: '' }).map((i) => i.id)).toEqual(['b'])
    expect(filtrarItens(itens, { texto: '', categoria: '', local: '', estado: '', tag: 'tecnologia' }).map((i) => i.id)).toEqual(['a'])
  })

  it('totais usam o valor de hoje, senão o pago', () => {
    expect(totais([item({ valor_atual: 100 }), item({ valor_compra: 50 }), item({})])).toEqual({ itens: 3, unidades: 3, valor: 150, semValor: 1 })
    // valor é por unidade: 5 cadeiras de 100 = 500
    expect(totais([item({ valor_atual: 100, quantidade: 5 }), item({ quantidade: 2 })])).toEqual({ itens: 2, unidades: 7, valor: 500, semValor: 1 })
  })

  it('mudou de lugar, de mão ou de situação', () => {
    const a = { local_id: 'pecas', local_tecnico: null, responsavel: null, situacao: 'em_uso' }
    expect(mudouOnde(a, { ...a })).toBe(false)
    expect(mudouOnde(a, { ...a, responsavel: 'Gabriel' })).toBe(true)
    expect(mudouOnde(a, { ...a, situacao: 'emprestado' })).toBe(true)
    expect(textoOnde('box_tecnico', 'Gabriel', () => 'Box Técnico')).toBe('Box Técnico · Gabriel')
    expect(textoOnde(null, null, (x) => x)).toBe('Sem local')
  })

  it('foto só vale na pasta do próprio usuário', () => {
    const u = '11111111-2222-3333-4444-555555555555'
    expect(caminhoFotoValido(`${u}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`, u)).toBe(true)
    expect(caminhoFotoValido(`outro/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`, u)).toBe(false)
    expect(caminhoFotoValido(`${u}/../x.jpg`, u)).toBe(false)
  })
})
