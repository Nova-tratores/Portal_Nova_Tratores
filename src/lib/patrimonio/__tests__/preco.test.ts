import { describe, expect, it } from 'vitest'
import { faixa, lerRespostaPreco, montarConsulta, podeBuscar, sugerirValor } from '../preco'

const resposta = '```json\n{"novo":[{"preco":295.69,"titulo":"A","url":"https://ml.com/a"},{"preco":"R$ 400,00","titulo":"B","url":"https://olx.com/b"},{"preco":0,"titulo":"zero","url":"https://x"},{"preco":350,"titulo":"sem link","url":""}],"usado":[{"preco":200,"titulo":"C","url":"https://olx.com/c"},{"preco":269,"titulo":"D","url":"https://olx.com/d"}],"observacao":" "}\n```'

describe('patrimônio — sugestão de preço', () => {
  it('monta a consulta sem repetir palavras e decide quando buscar', () => {
    expect(montarConsulta({ descricao: 'Cadeira Cavaletti', marca: 'Cavaletti', modelo: 'Start' })).toBe('Cadeira Cavaletti Start')
    expect(montarConsulta({ descricao: 'Caneca térmica', categoria: 'Copa e cozinha' })).toBe('Caneca térmica (Copa e cozinha)')
    expect(podeBuscar({ descricao: 'Mesa' })).toBe(false)
    expect(podeBuscar({ descricao: 'Mesa', categoria: 'Móvel de escritório' })).toBe(true)
    expect(podeBuscar({ descricao: 'Pc', marca: 'Dell' })).toBe(false)
  })

  it('lê o JSON do modelo e descarta anúncio sem preço ou sem link', () => {
    const r = lerRespostaPreco(resposta, 'x', new Date('2026-10-13T12:00:00Z'))
    expect(r.novo.map((a) => a.preco)).toEqual([295.69, 400])
    expect(r.usado).toHaveLength(2)
    expect(r.observacao).toBeNull()
    expect(() => lerRespostaPreco('não achei nada', 'x')).toThrow()
  })

  it('faixa e sugestão pelo estado', () => {
    const r = lerRespostaPreco(resposta, 'x')
    expect(faixa(r.novo)).toEqual({ min: 295.69, mediana: 347.85, max: 400, n: 2 })
    expect(sugerirValor(r, 'novo')).toEqual({ valor: 350, base: 'novo' })      // mediana do novo
    expect(sugerirValor(r, 'bom')).toEqual({ valor: 235, base: 'usado' })      // mediana do usado 234,5
    expect(sugerirValor(r, 'ruim')).toEqual({ valor: 95, base: 'usado' })      // 234,5 × 0,4
    expect(sugerirValor({ novo: r.novo, usado: [] }, 'regular')).toEqual({ valor: 175, base: 'novo' }) // 347,85 × 0,5
    expect(sugerirValor({ novo: [], usado: [] }, 'bom')).toBeNull()
    expect(sugerirValor({ novo: [{ preco: 19.9, titulo: '', url: 'https://a' }], usado: [] }, 'novo')).toEqual({ valor: 20, base: 'novo' })
  })
})
