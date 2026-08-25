import { describe, expect, it } from 'vitest'
import { extrairUnidadeId } from '../qr'
import { montarConferencia, ppvFaturado, saldoPorCodigo } from '../ppv-conferencia'
import type { PecaUnidade, UnidadeStatus } from '../unidades'

const UUID = '123e4567-e89b-42d3-a456-426614174000'

describe('extrairUnidadeId', () => {
  it('aceita o link completo de qualquer origin', () => {
    expect(extrairUnidadeId(`https://portal.novatratores.com.br/p/${UUID}`)).toBe(UUID)
    expect(extrairUnidadeId(`http://localhost:3000/p/${UUID.toUpperCase()}`)).toBe(UUID)
  })
  it('aceita uuid cru (digitado/colado)', () => {
    expect(extrairUnidadeId(` ${UUID} `)).toBe(UUID)
  })
  it('rejeita QR que não é de peça', () => {
    expect(extrairUnidadeId('https://exemplo.com/g/nao-e-uuid')).toBeNull()
    expect(extrairUnidadeId('UN-000123')).toBeNull()
    expect(extrairUnidadeId('')).toBeNull()
  })
})

describe('saldoPorCodigo', () => {
  it('agrega Saída − Devolução por código (Qtde é TEXTO, com vírgula BR)', () => {
    const m = saldoPorCodigo([
      { TipoMovimento: 'Saída', CodProduto: 'AB-1', Descricao: 'FILTRO', Qtde: '3', Preco: 100 },
      { TipoMovimento: 'Devolução', CodProduto: 'ab-1', Qtde: '1', Preco: 100 },
      { TipoMovimento: 'Saída', CodProduto: 'CD-2', Qtde: '0,5', Preco: '10,50' },
    ])
    expect(m.get('AB-1')).toMatchObject({ saldo: 2, descricao: 'FILTRO', preco: 100 })
    expect(m.get('CD-2')).toMatchObject({ saldo: 0.5, preco: 10.5 })
  })

  it('preço: a última Saída com preço vence; Devolução não mexe no preço', () => {
    const m = saldoPorCodigo([
      { TipoMovimento: 'Saída', CodProduto: 'AB-1', Qtde: '1', Preco: 80 },
      { TipoMovimento: 'Saída', CodProduto: 'AB-1', Qtde: '1', Preco: 95 },
      { TipoMovimento: 'Devolução', CodProduto: 'AB-1', Qtde: '1', Preco: 10 },
    ])
    expect(m.get('AB-1')?.preco).toBe(95)
  })
})

// helper: unidade mínima pro montarConferencia
let seq = 0
const un = (codigo: string, status: UnidadeStatus, extra: Partial<PecaUnidade> = {}): PecaUnidade => ({
  id: `id-${++seq}`, numero: `UN-${String(seq).padStart(6, '0')}`, lote_id: 'l', conta_omie: 'NOVA',
  codigo, descricao: '', locacao: '', alt_conta_omie: null, alt_codigo: null, alt_descricao: null,
  alt_locacao: null, status, destino_tipo: 'ppv', destino_os: null, destino_ppv: 'PPV-0001',
  venda_preco: null, destino_obs: '', retirado_por: null, retirado_por_nome: '', retirado_em: null,
  liberado_por: null, liberado_em: null, aplicado_em: null, devolvido_em: null, criado_por: null,
  criado_por_nome: '', created_at: '', updated_at: '', ...extra,
})

const cab = { id_pedido: 'PPV-0001', status: 'Concluída', Tipo_Pedido: 'Pedido' }

describe('montarConferencia', () => {
  it('PPV faturado com liberada pendente → liberada_nao_faturada', () => {
    const porCod = saldoPorCodigo([{ TipoMovimento: 'Saída', CodProduto: 'AB-1', Qtde: '2', Preco: 50 }])
    const conf = montarConferencia(cab, true, porCod, [un('AB-1', 'liberada'), un('AB-1', 'aplicada')])
    expect(conf.linhas).toHaveLength(1)
    expect(conf.linhas[0].flags).toContain('liberada_nao_faturada')
    expect(conf.linhas[0].liberadas).toBe(1)
    expect(conf.linhas[0].aplicadas).toBe(1)
  })

  it('PPV faturado com reserva nunca liberada → faturada_sem_liberacao', () => {
    const porCod = saldoPorCodigo([{ TipoMovimento: 'Saída', CodProduto: 'AB-1', Qtde: '1', Preco: 50 }])
    const conf = montarConferencia(cab, true, porCod, [un('AB-1', 'retirada_pendente')])
    expect(conf.linhas[0].flags).toContain('faturada_sem_liberacao')
  })

  it('item sem etiqueta é só informativo (sem_rastreio), não erro', () => {
    const porCod = saldoPorCodigo([{ TipoMovimento: 'Saída', CodProduto: 'EF-9', Qtde: '3', Preco: 5 }])
    const conf = montarConferencia(cab, true, porCod, [])
    expect(conf.linhas[0].flags).toEqual(['sem_rastreio'])
  })

  it('unidade presa a código que saiu do pedido → rastreio_excedente (linha órfã)', () => {
    const conf = montarConferencia(cab, false, saldoPorCodigo([]), [un('ZZ-9', 'liberada')])
    expect(conf.linhas).toHaveLength(1)
    expect(conf.linhas[0].flags).toContain('rastreio_excedente')
  })

  it('etiqueta dupla casa pelo alt_codigo', () => {
    const porCod = saldoPorCodigo([{ TipoMovimento: 'Saída', CodProduto: 'CASTRO-77', Qtde: '1', Preco: 30 }])
    const conf = montarConferencia(cab, false, porCod, [un('NOVA-11', 'aplicada', { alt_codigo: 'castro-77' })])
    expect(conf.linhas).toHaveLength(1)
    expect(conf.linhas[0].aplicadas).toBe(1)
    expect(conf.linhas[0].flags).not.toContain('rastreio_excedente')
  })

  it('PPV aberto sem pendência não levanta flags de faturamento', () => {
    const porCod = saldoPorCodigo([{ TipoMovimento: 'Saída', CodProduto: 'AB-1', Qtde: '1', Preco: 50 }])
    const conf = montarConferencia({ ...cab, status: 'Execução' }, false, porCod, [un('AB-1', 'retirada_pendente')])
    expect(conf.linhas[0].flags).toEqual([])
  })
})

describe('ppvFaturado', () => {
  it('carimbo de NF fatura; Remessa enviada ao Omie também conta', () => {
    expect(ppvFaturado({ faturado_omie_em: '2026-08-14', Tipo_Pedido: 'Pedido', pedido_omie: '123' })).toBe(true)
    expect(ppvFaturado({ faturado_omie_em: null, Tipo_Pedido: 'Remessa', pedido_omie: '123' })).toBe(true)
    expect(ppvFaturado({ faturado_omie_em: null, Tipo_Pedido: 'Pedido', pedido_omie: '123' })).toBe(false)
    expect(ppvFaturado({ faturado_omie_em: null, Tipo_Pedido: 'Remessa', pedido_omie: null })).toBe(false)
  })
})
