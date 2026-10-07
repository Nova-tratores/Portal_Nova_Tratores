import { describe, expect, it } from 'vitest'
import {
  acoesDoStatus, agruparLocais, calcularTotais, mascaraMoeda, precoParaCampo, camposFaltando, DESTINOS, FILTROS_VAZIOS, filtrarItens, lerPreco, ordenarFila,
  etapaDoItem, pendenciasDestino, pendenciasPara, pendenciasSeparacao, pendenciasVerificacao, transicaoValida,
  codigoDefinitivo, nomeDoItem,
} from '../regras'
import { folhasNecessarias, posicaoDepois } from '../etiqueta'
import { STATUS, type Item, type Status } from '../tipos'

function item(p: Partial<Item> = {}): Item {
  return {
    id: 'i', codigo: 'PNI-000001', codigo_fabricante: null, descricao: null, quantidade: 1,
    qualidade: 'nao_avaliada', status: 'aguardando_identificacao', nao_identificavel: false,
    preco_sugerido: null, motivo_descarte: null, observacoes: null, etiqueta_impressa_em: null, token_publico: 'a'.repeat(32), local_id: null, local_tecnico: null,
    desfecho: null, encerrado_em: null, encerrado_por: null,
    decisao: null, decisao_obs: null, decidido_em: null, decidido_por: null,
    verificado_em: null, verificado_por: null, verificado_setor: null, verificado_com: null, verificacao_obs: null,
    criado_por: 'u', criado_em: '2026-10-07T12:00:00Z', atualizado_por: null, atualizado_em: '2026-10-07T12:00:00Z',
    fotos: [], aplicacoes: [], ...p,
  }
}

describe('transições de status (espelho de pni_transicao_valida)', () => {
  const validas: [Status, Status][] = [
    ['aguardando_identificacao', 'identificado'], ['identificado', 'precificado'],
    ['precificado', 'a_venda'], ['a_venda', 'vendido'],
    ['identificado', 'aguardando_identificacao'], ['precificado', 'identificado'], ['a_venda', 'precificado'],
    ['a_venda', 'identificado'], ['precificado', 'vendido'],   // destino: volta p/ verificação ou vende
    // destinos finais (menos vendido) saem de qualquer status em aberto
    ...(['aguardando_identificacao', 'identificado', 'precificado', 'a_venda'] as Status[]).flatMap((de) =>
      (['descartado', 'guardado', 'usado', 'outro_destino'] as Status[]).map((para) => [de, para] as [Status, Status])),
  ]
  it('aceita exatamente as transições previstas', () => {
    for (const de of STATUS) for (const para of STATUS) {
      const esperado = validas.some(([a, b]) => a === de && b === para)
      expect(transicaoValida(de, para), `${de} → ${para}`).toBe(esperado)
    }
  })
  it('rejeita pular etapas e sair de status final', () => {
    expect(transicaoValida('aguardando_identificacao', 'precificado')).toBe(false)
    expect(transicaoValida('aguardando_identificacao', 'a_venda')).toBe(false)
    expect(transicaoValida('vendido', 'a_venda')).toBe(false)
    expect(transicaoValida('descartado', 'aguardando_identificacao')).toBe(false)
    expect(transicaoValida('guardado', 'usado')).toBe(false)
  })
  it('botões rápidos só oferecem transições válidas', () => {
    for (const s of STATUS) for (const a of acoesDoStatus(s)) expect(transicaoValida(s, a.para)).toBe(true)
    // separação e verificação têm tela própria; só "à venda" tem botões soltos
    expect(acoesDoStatus('aguardando_identificacao')).toEqual([])
    expect(acoesDoStatus('a_venda').map((a) => a.para)).toEqual(['vendido', 'identificado'])
    expect(transicaoValida('precificado', 'guardado')).toBe(true)
    for (const d of DESTINOS) expect(transicaoValida('aguardando_identificacao', d.status)).toBe(true)
    expect(acoesDoStatus('vendido')).toEqual([])
  })
})

describe('requisitos por status', () => {
  it('à venda exige descrição e aplicação, ou não identificável', () => {
    expect(pendenciasPara(item({ preco_sugerido: 10 }), 'a_venda')).toEqual(['descrição', 'pelo menos uma aplicação'])
    expect(pendenciasPara(item({ preco_sugerido: 10, descricao: 'eixo', aplicacoes: [{ tipo_maquina_id: 't', marca_id: null }] }), 'a_venda')).toEqual([])
    expect(pendenciasPara(item(), 'identificado')).toEqual([])
  })
  it('à venda exige preço; descarte exige motivo', () => {
    expect(pendenciasPara(item({ nao_identificavel: true }), 'a_venda')).toEqual(['preço sugerido'])
    expect(pendenciasPara(item(), 'descartado')).toEqual(['motivo do descarte'])
    expect(pendenciasPara(item(), 'descartado', '  sucata ')).toEqual([])
    expect(pendenciasPara(item(), 'outro_destino')).toEqual(['o que aconteceu'])
    expect(pendenciasPara(item(), 'guardado')).toEqual([])
  })
  it('cadastro incompleto: avisa o que falta, some quando encerra', () => {
    expect(camposFaltando(item())).toEqual(['localização', 'descrição', 'aplicação', 'preço', 'qualidade'])
    expect(camposFaltando(item({ nao_identificavel: true, local_id: 'pecas', qualidade: 'sucata' }))).toEqual([])
    expect(camposFaltando(item({ status: 'guardado' }))).toEqual([])
  })
})

describe('lerPreco', () => {
  it('entende formatos brasileiros e americanos', () => {
    expect(lerPreco('')).toBeNull()
    expect(lerPreco('150')).toBe(150)
    expect(lerPreco('1.234,56')).toBe(1234.56)
    expect(lerPreco('R$ 99,9')).toBe(99.9)
    expect(lerPreco('1234.5')).toBe(1234.5)
    expect(lerPreco('1.500')).toBe(1500)
    expect(Number.isNaN(lerPreco('abc') as number)).toBe(true)
  })
})

describe('filtros e totais', () => {
  const itens = [
    item({ id: '1', codigo: 'PNI-000001', descricao: 'Engrenagem de câmbio', status: 'a_venda', quantidade: 2, preco_sugerido: 100,
      aplicacoes: [{ tipo_maquina_id: 'trator', marca_id: 'mahindra' }] }),
    item({ id: '2', codigo: 'XYZ-9', descricao: 'Disco', status: 'precificado', quantidade: 3, preco_sugerido: 10, qualidade: 'sucata',
      aplicacoes: [{ tipo_maquina_id: 'grade', marca_id: null }], criado_em: '2026-09-01T02:00:00Z' }),
    item({ id: '3', status: 'aguardando_identificacao', etiqueta_impressa_em: '2026-10-07T12:00:00Z' }),
    item({ id: '4', status: 'vendido', quantidade: 5, preco_sugerido: 1000 }),
  ]

  it('busca por texto sem acento, código e descrição', () => {
    expect(filtrarItens(itens, { ...FILTROS_VAZIOS, texto: 'cambio' }).map((i) => i.id)).toEqual(['1'])
    expect(filtrarItens(itens, { ...FILTROS_VAZIOS, texto: 'xyz' }).map((i) => i.id)).toEqual(['2'])
  })
  it('marca inclui peça de "qualquer marca"; tipo e marca na mesma aplicação', () => {
    expect(filtrarItens(itens, { ...FILTROS_VAZIOS, marca: 'mahindra' }).map((i) => i.id)).toEqual(['1', '2'])
    expect(filtrarItens(itens, { ...FILTROS_VAZIOS, tipo: 'grade', marca: 'mahindra' }).map((i) => i.id)).toEqual(['2'])
    expect(filtrarItens(itens, { ...FILTROS_VAZIOS, tipo: 'trator' }).map((i) => i.id)).toEqual(['1'])
  })
  it('status, qualidade, preço, data (horário de Brasília) e etiqueta pendente', () => {
    expect(filtrarItens(itens, { ...FILTROS_VAZIOS, status: ['a_venda', 'precificado'] })).toHaveLength(2)
    expect(filtrarItens(itens, { ...FILTROS_VAZIOS, qualidade: ['sucata'] }).map((i) => i.id)).toEqual(['2'])
    expect(filtrarItens(itens, { ...FILTROS_VAZIOS, precoMin: '50', precoMax: '500' }).map((i) => i.id)).toEqual(['1'])
    // 2026-09-01T02:00Z = 31/08 às 23h em Brasília
    expect(filtrarItens(itens, { ...FILTROS_VAZIOS, dataAte: '2026-08-31' }).map((i) => i.id)).toEqual(['2'])
    expect(filtrarItens(itens, { ...FILTROS_VAZIOS, soEtiquetaPendente: true }).map((i) => i.id)).toEqual(['1', '2', '4'])
    expect(filtrarItens(itens, { ...FILTROS_VAZIOS, soIncompletos: true }).map((i) => i.id)).toEqual(['1', '2', '3'])
  })
  it('totais: itens/unidades por status e valor só de precificados e à venda', () => {
    const t = calcularTotais(itens)
    expect(t.itens).toBe(4)
    expect(t.unidades).toBe(11)
    expect(t.porStatus.a_venda).toEqual({ itens: 1, unidades: 2 })
    expect(t.valorSugerido).toBe(2 * 100 + 3 * 10)
  })
  it('fila: mais antigo primeiro', () => {
    expect(ordenarFila(itens).map((i) => i.id)[0]).toBe('2')
  })
})

describe('etiquetas: aproveitamento da folha', () => {
  it('continua de onde parou e conta as folhas', () => {
    expect(posicaoDepois(0, 1)).toBe(1)
    expect(posicaoDepois(28, 5)).toBe(3)
    expect(posicaoDepois(10, 20)).toBe(0)
    expect(folhasNecessarias(0, 30)).toBe(1)
    expect(folhasNecessarias(25, 6)).toBe(2)
    expect(folhasNecessarias(5, 0)).toBe(0)
  })
})

describe('máscara de dinheiro do preço', () => {
  it('formata enquanto digita (estilo caixa) e volta para número', () => {
    expect(mascaraMoeda('')).toBe('')
    expect(mascaraMoeda('1')).toBe('0,01')
    expect(mascaraMoeda('150')).toBe('1,50')
    expect(mascaraMoeda('15000')).toBe('150,00')
    expect(mascaraMoeda('R$ 1.234,567')).toBe('12.345,67')
    expect(mascaraMoeda('000')).toBe('')
    expect(lerPreco(mascaraMoeda('123456'))).toBe(1234.56)
    expect(precoParaCampo(1500)).toBe('1.500,00')
    expect(precoParaCampo(null)).toBe('')
  })
})

describe('locais agrupados por área', () => {
  it('junta andares e oficina; desconhecido vai para Outros', () => {
    const l = (id: string, nome: string, ordem: number) => ({ id, nome, ordem, ativo: true, exige_tecnico: id === 'box_tecnico' })
    const g = agruparLocais([
      l('pos_vendas', 'Pós-Vendas', 10), l('pos_vendas_2andar', 'Pós-Vendas - Segundo Andar', 20),
      l('fundo_oficina', 'Fundo Oficina', 30), l('box_tecnico', 'Box Técnico', 50), l('deposito_x', 'Depósito X', 90),
    ])
    expect(g.map((x) => x.titulo)).toEqual(['Pós-Vendas', 'Oficina', 'Outros'])
    expect(g[0].itens.map((i) => i.rotulo)).toEqual(['Térreo', '2º andar'])
    expect(g[2].itens[0].rotulo).toBe('Depósito X')
  })
})

describe('etapas: separação e verificação', () => {
  it('em que etapa a peça está', () => {
    expect(etapaDoItem(item())).toBe('separacao')
    expect(etapaDoItem(item({ status: 'identificado' }))).toBe('verificacao')
    expect(etapaDoItem(item({ status: 'precificado' }))).toBe('destino')
    expect(etapaDoItem(item({ status: 'a_venda' }))).toBe('destino')
    expect(etapaDoItem(item({ status: 'guardado' }))).toBeNull()
  })
  it('separação: decisão obrigatória; descartar e outro pedem o motivo', () => {
    expect(pendenciasSeparacao(null, '')).toEqual(['escolher o que fazer com a peça'])
    expect(pendenciasSeparacao('vender', '')).toEqual([])
    expect(pendenciasSeparacao('descartar', ' ')).toEqual(['motivo do descarte'])
    expect(pendenciasSeparacao('outro', 'doada')).toEqual([])
  })
  it('verificação: valor e aplicação conferidos com um setor', () => {
    const base = item({ status: 'identificado', decisao: 'vender' })
    expect(pendenciasVerificacao(base, '')).toEqual(['descrição', 'aplicação', 'valor', 'setor consultado'])
    const ok = { ...base, descricao: 'eixo', aplicacoes: [{ tipo_maquina_id: 't', marca_id: null }], preco_sugerido: 50 }
    expect(pendenciasVerificacao(ok, 'Peças')).toEqual([])
    expect(pendenciasVerificacao({ ...ok, decisao: 'usar', preco_sugerido: null }, 'Oficina')).toEqual([])
  })
  it('destino: finaliza pelo plano; descartar e outro pedem o motivo', () => {
    expect(pendenciasDestino('guardar', '')).toEqual([])
    expect(pendenciasDestino('descartar', '')).toEqual(['motivo do descarte'])
    expect(pendenciasDestino(null, '')).toEqual(['escolher o destino'])
  })
})

describe('código definitivo só no Destino', () => {
  it('CAP- é provisório; PNI- e códigos antigos são definitivos', () => {
    expect(codigoDefinitivo('CAP-000045')).toBe(false)
    expect(codigoDefinitivo('PNI-000123')).toBe(true)
    expect(codigoDefinitivo('XYZ-9')).toBe(true)
  })
  it('nome para texto corrido', () => {
    expect(nomeDoItem('CAP-000045')).toBe('captação nº 45')
    expect(nomeDoItem('PNI-000123')).toBe('PNI-000123')
  })
})
