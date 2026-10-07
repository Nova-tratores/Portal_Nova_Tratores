import { describe, expect, it } from 'vitest'
import { BOM, COLUNAS_CSV, gerarCsv } from '../csv'
import type { Item, Nomes } from '../tipos'

const nomes: Nomes = {
  tipos: { t1: 'Grade aradora' },
  marcas: { m1: 'Baldan' },
  usuarios: { u1: 'José Conceição' },
  locais: { box_tecnico: 'Box Técnico' },
}

const base: Item = {
  id: 'a', codigo: 'PNI-000123', codigo_fabricante: 'BD-77', descricao: 'Disco de grade; recortado "18 pol"',
  quantidade: 4, qualidade: 'usada_com_avaria', status: 'a_venda', nao_identificavel: false,
  preco_sugerido: 1234.5, motivo_descarte: null, observacoes: 'linha 1\nlinha 2', etiqueta_impressa_em: null, token_publico: 'a'.repeat(32),
  local_id: 'box_tecnico', local_tecnico: 'Gabriel Moraes', desfecho: null, encerrado_em: null, encerrado_por: null,
  decisao: null, decisao_obs: null, decidido_em: null, decidido_por: null,
    verificado_em: null, verificado_por: null, verificado_setor: null, verificado_com: null, verificacao_obs: null,
  criado_por: 'u1', criado_em: '2026-10-07T13:05:00Z', atualizado_por: 'u1', atualizado_em: '2026-10-07T13:05:00Z',
  fotos: [{ id: 'f1', storage_path: 'u1/a.jpg', ordem: 1 }, { id: 'f2', storage_path: 'u1/b.jpg', ordem: 2 }],
  aplicacoes: [{ tipo_maquina_id: 't1', marca_id: 'm1' }, { tipo_maquina_id: 't1', marca_id: null }],
}

describe('CSV para Excel pt-BR', () => {
  const csv = gerarCsv([base], nomes)

  it('começa com BOM, usa ; e CRLF', () => {
    expect(csv.startsWith(BOM)).toBe(true)
    const linhas = csv.slice(1).split('\r\n')
    expect(linhas[0]).toBe(COLUNAS_CSV.join(';'))
    expect(linhas[0].split(';')).toHaveLength(COLUNAS_CSV.length)
  })

  it('preserva acentos em UTF-8 (bytes do BOM + ç/ã/é)', () => {
    const bytes = new TextEncoder().encode(csv)
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const texto = new TextDecoder('utf-8').decode(bytes)
    expect(texto).toContain('Código existente (fabricante)')
    expect(texto).toContain('Descrição')
    expect(texto).toContain('José Conceição')
    expect(texto).toContain('À venda')
  })

  it('escapa ; aspas e quebra de linha, e usa vírgula decimal', () => {
    expect(csv).toContain('"Disco de grade; recortado ""18 pol"""')
    expect(csv).toContain('"linha 1\nlinha 2"')
    expect(csv).toContain(';1234,50;4938,00;Box Técnico (Gabriel Moraes);')
    expect(csv).toContain('Grade aradora Baldan; Grade aradora (qualquer marca)')
  })

  it('preço vazio sai em branco (não zero)', () => {
    const c = gerarCsv([{ ...base, preco_sugerido: null, descricao: 'x', aplicacoes: [] }], nomes)
    expect(c.split('\r\n')[1].split(';').slice(8, 10)).toEqual(['', ''])
  })
})
