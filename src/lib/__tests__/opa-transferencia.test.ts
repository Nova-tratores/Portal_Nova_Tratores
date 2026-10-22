import { describe, it, expect } from 'vitest'
import { estadoDaQualidade, qualidadeDoEstado, patrimonioDaPeca, pecaDoPatrimonio } from '../opa-transferencia'

describe('transferência Peças ↔ Patrimônio', () => {
  it('converte qualidade e estado', () => {
    expect(estadoDaQualidade('nova')).toBe('novo')
    expect(estadoDaQualidade('sucata')).toBe('ruim')
    expect(estadoDaQualidade(null)).toBe('bom')
    expect(qualidadeDoEstado('regular')).toBe('usada_com_avaria')
    expect(qualidadeDoEstado('sem_uso')).toBe('nao_avaliada')
  })
  it('peça → patrimônio leva quantidade, lugar, preço e a origem nas observações', () => {
    const d = patrimonioDaPeca({ codigo: 'CAP-000012', descricao: ' Bomba hidráulica ', quantidade: 3, qualidade: 'usada_boa', codigo_fabricante: '006009', preco_sugerido: '850.00', local_id: 'galpao', local_tecnico: null, etiquetas: ['6075'] })
    expect(d).toMatchObject({ descricao: 'Bomba hidráulica', quantidade: 3, estado: 'bom', situacao: 'guardado', local_id: 'galpao', valor_atual: 850, tags: ['6075'] })
    expect(String(d.observacoes)).toContain('CAP-000012')
    expect(String(d.observacoes)).toContain('006009')
  })
  it('patrimônio → peça entra na verificação', () => {
    const d = pecaDoPatrimonio({ codigo: 'PAT-000004', descricao: 'Macaco hidráulico', quantidade: 0, estado: 'novo', marca: 'Bovenau', modelo: '20t', local_id: 'loja' })
    expect(d).toMatchObject({ descricao: 'Macaco hidráulico', quantidade: 1, qualidade: 'nova', status: 'aguardando_identificacao', local_id: 'loja' })
    expect(String(d.observacoes)).toContain('PAT-000004')
    expect(String(d.observacoes)).toContain('Bovenau 20t')
  })
})
