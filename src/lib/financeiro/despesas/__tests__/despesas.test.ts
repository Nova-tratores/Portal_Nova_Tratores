import { describe, expect, it } from 'vitest'
import {
  hojeISO, intervaloDoPreset, mesesDoIntervalo, rotuloDia, rotuloIntervalo,
  rotuloSemana, segundaDaSemanaISO, somarDias, ultimoDiaDoMes,
} from '../periodo'
import {
  enriquecer, indexarTitulos, montarArvore, montarDicionario, rankingCategorias,
  rankingFornecedores, resumir, serieMensal, SEM_CATEGORIA,
} from '../agregar'
import { anexosDaDespesa } from '../anexos'
import { descreverLog } from '../logs'
import { estadoParcela, situacaoOmie, urlOmieFinanceiro } from '../omie'
import type { DespesaRow, TituloOmie } from '../tipos'

// ── fábrica de linha, pra cada teste dizer só o que importa ────────────────
let seq = 0
const linha = (p: Partial<DespesaRow> = {}): DespesaRow => ({
  id: ++seq,
  fornecedor: 'FORNECEDOR X',
  valor: 100,
  data_vencimento: '2026-08-20',
  numero_NF: null, metodo: 'Boleto', motivo: null, qtd_parcelas: null,
  anexo_nf: null, anexo_boleto: null, anexo_requisicao: null, anexo_comprovante: null,
  status: 'concluido', status_envio: 'enviado',
  omie_categoria: null, omie_cod_lancamento: '123', omie_empresa: 'Nova Tratores',
  omie_sync_em: null, criado_por: null, criado_em: null,
  ...p,
})

const DIC = montarDicionario([
  { empresa: 'Nova Tratores', codigo: '2.02.99', descricao: 'Combustível' },
  { empresa: 'Nova Tratores', codigo: '2.05.02', descricao: 'Multas' },
  { empresa: 'Castro Peças', codigo: '2.02.99', descricao: 'Combustível (Castro)' },
])
const enr = (rows: DespesaRow[]) => rows.map((r) => enriquecer(r, DIC))

describe('datas (aritmética UTC, nunca new Date(string))', () => {
  it('segunda-feira da semana', () => {
    expect(segundaDaSemanaISO('2026-08-17')).toBe('2026-08-17') // já é segunda
    expect(segundaDaSemanaISO('2026-08-20')).toBe('2026-08-17') // quinta
    expect(segundaDaSemanaISO('2026-08-23')).toBe('2026-08-17') // domingo fecha a semana
  })

  it('vira o mês e vira o ano sem se perder', () => {
    // 01/02/2026 é domingo: pertence à semana que começou em 26/01
    expect(segundaDaSemanaISO('2026-02-01')).toBe('2026-01-26')
    // 01/01/2027 é sexta: semana começou em 28/12/2026
    expect(segundaDaSemanaISO('2027-01-01')).toBe('2026-12-28')
  })

  it('não escorrega um dia por causa de fuso', () => {
    // O erro clássico é `new Date('2026-08-01')` = meia-noite UTC = 31/07 em
    // BRT. Se alguém refatorar pra Date local, estes casos caem.
    expect(rotuloDia('2026-08-01').numero).toBe('1')
    expect(rotuloDia('2026-08-20')).toEqual({ numero: '20', diaSemana: 'qui' })
    expect(somarDias('2026-02-28', 1)).toBe('2026-03-01')
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31')
    expect(hojeISO(new Date('2026-08-21T02:00:00Z'))).toBe('2026-08-20') // 23h de SP
  })

  it('último dia do mês, inclusive fevereiro', () => {
    expect(ultimoDiaDoMes('2026-02')).toBe('2026-02-28')
    expect(ultimoDiaDoMes('2028-02')).toBe('2028-02-29') // bissexto
    expect(ultimoDiaDoMes('2026-08')).toBe('2026-08-31')
  })

  it('preset cobre N meses fechados e não estoura em dia 31', () => {
    expect(intervaloDoPreset('12m', '2026-08-21')).toEqual({ de: '2025-09-01', ate: '2026-08-31' })
    expect(intervaloDoPreset('3m', '2026-01-31')).toEqual({ de: '2025-11-01', ate: '2026-01-31' })
    expect(mesesDoIntervalo('2025-11-01', '2026-01-31')).toEqual(['2025-11', '2025-12', '2026-01'])
  })

  it('rótulos legíveis', () => {
    expect(rotuloSemana('2026-08-17', '2026-08-23')).toBe('17–23 ago')
    expect(rotuloSemana('2026-08-31', '2026-08-31')).toBe('31 ago')
    expect(rotuloIntervalo('2026-02-01', '2026-08-31')).toBe('fev–ago/2026')
  })
})

describe('árvore mês → semana → dia', () => {
  it('soma dos dias = semana, soma das semanas = mês', () => {
    const arv = montarArvore(enr([
      linha({ valor: 100, data_vencimento: '2026-08-20' }),
      linha({ valor: 50, data_vencimento: '2026-08-20' }),
      linha({ valor: 25, data_vencimento: '2026-08-18' }),
      linha({ valor: 10, data_vencimento: '2026-08-03' }),
    ]))
    expect(arv).toHaveLength(1)
    const mes = arv[0]
    expect(mes.mes).toBe('2026-08')
    expect(mes.total).toBe(185)
    expect(mes.qtd).toBe(4)
    for (const s of mes.semanas) {
      expect(s.dias.reduce((t, d) => t + d.total, 0)).toBe(s.total)
    }
    expect(mes.semanas.reduce((t, s) => t + s.total, 0)).toBe(mes.total)
  })

  it('semana que cruza o mês é RECORTADA e não conta em dobro', () => {
    // 26/01 (seg) a 01/02 (dom) — mesma semana, meses diferentes
    const arv = montarArvore(enr([
      linha({ valor: 300, data_vencimento: '2026-01-28' }),
      linha({ valor: 700, data_vencimento: '2026-02-01' }),
    ]))
    const fev = arv.find((m) => m.mes === '2026-02')!
    const jan = arv.find((m) => m.mes === '2026-01')!

    // a mesma segunda aparece nos dois meses...
    expect(fev.semanas[0].segunda).toBe('2026-01-26')
    expect(jan.semanas[0].segunda).toBe('2026-01-26')
    // ...mas cada ocorrência só mostra e só soma os dias do seu mês
    expect(fev.semanas[0].inicio).toBe('2026-02-01')
    expect(fev.semanas[0].total).toBe(700)
    expect(jan.semanas[0].fim).toBe('2026-01-31')
    expect(jan.semanas[0].total).toBe(300)
    // e o total global fecha: 1000, não 2000
    expect(arv.reduce((t, m) => t + m.total, 0)).toBe(1000)
  })

  it('meses em ordem decrescente e despesa sem vencimento fica de fora', () => {
    const arv = montarArvore(enr([
      linha({ data_vencimento: '2026-06-10' }),
      linha({ data_vencimento: '2026-08-10' }),
      linha({ data_vencimento: null }),
    ]))
    expect(arv.map((m) => m.mes)).toEqual(['2026-08', '2026-06'])
    expect(arv.reduce((t, m) => t + m.qtd, 0)).toBe(2)
  })
})

describe('série mensal', () => {
  it('enumera meses vazios em vez de pulá-los', () => {
    const s = serieMensal(
      enr([linha({ valor: 40, data_vencimento: '2026-03-05' })]),
      ['2026-01', '2026-02', '2026-03'],
      '2026-03',
    )
    expect(s.map((p) => p.total)).toEqual([0, 0, 40])
    expect(s.map((p) => p.label)).toEqual(['jan/26', 'fev/26', 'mar/26'])
    expect(s[2].parcial).toBe(true)
    expect(s[0].parcial).toBe(false)
  })
})

describe('rankings', () => {
  it('top N + "Outros" continua somando o total (não esconde dinheiro)', () => {
    const rows = ['A', 'B', 'C', 'D', 'E'].map((n, i) =>
      linha({ fornecedor: n, valor: (5 - i) * 100 }))
    const r = rankingFornecedores(enr(rows), 3)
    expect(r).toHaveLength(4)
    expect(r[3].ehOutros).toBe(true)
    expect(r[3].rotulo).toBe('Outros (2)')
    expect(r.reduce((t, f) => t + f.total, 0)).toBe(1500)
    expect(r.reduce((t, f) => t + f.percentual, 0)).toBeCloseTo(1, 10)
  })

  it('sem cauda, não inventa balde "Outros"', () => {
    const r = rankingFornecedores(enr([linha({ fornecedor: 'A' }), linha({ fornecedor: 'B' })]), 5)
    expect(r.some((f) => f.ehOutros)).toBe(false)
  })

  it('cauda de UM item aparece inteiro, não vira "Outros (1)"', () => {
    // agrupar um item só custa a mesma linha e informa menos
    const rows = ['A', 'B', 'C'].map((n, i) => linha({ fornecedor: n, valor: (3 - i) * 100 }))
    const r = rankingFornecedores(enr(rows), 2)
    expect(r).toHaveLength(3)
    expect(r.some((f) => f.ehOutros)).toBe(false)
    expect(r[2].rotulo).toBe('C')
  })

  it('mesmo fornecedor com grafias diferentes vira UMA fatia', () => {
    const r = rankingFornecedores(enr([
      linha({ fornecedor: 'AGRO PECAS LTDA', valor: 100 }),
      linha({ fornecedor: ' agro peças ', valor: 100 }),
      linha({ fornecedor: 'AGRO PEÇAS LTDA.', valor: 100 }),
    ]))
    expect(r).toHaveLength(1)
    expect(r[0].total).toBe(300)
    expect(r[0].variantes).toHaveLength(3)
  })

  it('categoria sem código cai em "Sem categoria" e continua no gráfico', () => {
    const r = rankingCategorias(enr([
      linha({ omie_categoria: '2.02.99', valor: 80 }),
      linha({ omie_categoria: null, valor: 20 }),
    ]))
    expect(r.find((c) => c.rotulo === 'Combustível')?.total).toBe(80)
    expect(r.find((c) => c.rotulo === SEM_CATEGORIA)?.total).toBe(20)
    expect(r.reduce((t, c) => t + c.total, 0)).toBe(100)
  })
})

describe('categoria', () => {
  it('traduz o código pelo nome, respeitando a empresa', () => {
    const [nova] = enr([linha({ omie_categoria: '2.02.99', omie_empresa: 'Nova Tratores' })])
    const [castro] = enr([linha({ omie_categoria: '2.02.99', omie_empresa: 'Castro Peças' })])
    expect(nova.categoria).toBe('Combustível')
    expect(castro.categoria).toBe('Combustível (Castro)')
    expect(nova.origemCategoria).toBe('cache')
  })

  it('código fora do cache aparece cru, em vez de sumir', () => {
    const [d] = enr([linha({ omie_categoria: '9.99.99' })])
    expect(d.categoria).toBe('9.99.99')
    expect(d.origemCategoria).toBe('codigo')
  })
})

describe('situação no Omie', () => {
  it('quem tem código de lançamento está no Omie', () => {
    expect(situacaoOmie({ omie_cod_lancamento: '4815', status_envio: 'rascunho' })).toBe('enviado')
  })

  it('erro de envio só vale quando não foi', () => {
    expect(situacaoOmie({ omie_cod_lancamento: null, status_envio: 'erro' })).toBe('erro')
    expect(situacaoOmie({ omie_cod_lancamento: '99', status_envio: 'erro' })).toBe('enviado')
  })

  it('rascunho sem código é acervo fora do Omie, não erro', () => {
    expect(situacaoOmie({ omie_cod_lancamento: '', status_envio: 'rascunho' })).toBe('fora')
    expect(situacaoOmie({ omie_cod_lancamento: null, status_envio: null })).toBe('fora')
  })
})

describe('parcelas no Omie', () => {
  const titulo = (cod: string, parcela: string, status: string, extra: Partial<TituloOmie> = {}): TituloOmie => ({
    codigo_lancamento: cod, numero_documento: '8227', numero_documento_fiscal: '8227',
    numero_parcela: parcela, status_titulo: status, data_vencimento: '2026-08-10',
    data_pagamento: null, valor_documento: 478.33, valor_pago: null, ...extra,
  })

  it('traduz o status do Omie sem nunca supor pagamento', () => {
    expect(estadoParcela('PAGO')).toBe('paga')
    expect(estadoParcela('ATRASADO')).toBe('atrasada')
    expect(estadoParcela('CANCELADO')).toBe('cancelada')
    expect(estadoParcela('A VENCER')).toBe('a_vencer')
    // status desconhecido/vazio JAMAIS pode virar 'paga' — é o erro caro
    expect(estadoParcela(null)).toBe('a_vencer')
    expect(estadoParcela('QUALQUER COISA NOVA')).toBe('a_vencer')
  })

  it('junta as parcelas da despesa, em ordem, e conta as pagas', () => {
    const idx = indexarTitulos([
      titulo('3', '003/003', 'A VENCER'),
      titulo('1', '001/003', 'PAGO', { data_pagamento: '2026-08-10' }),
      titulo('2', '002/003', 'A VENCER'),
    ])
    const d = enriquecer(linha({ omie_cod_lancamento: '1, 2, 3', qtd_parcelas: 3 }), DIC, idx)
    expect(d.parcelas.map((p) => p.numero)).toEqual(['001/003', '002/003', '003/003'])
    expect(d.parcelasPagas).toBe(1)
    expect(d.parcelas[0].pagamento).toBe('2026-08-10')
    expect(d.numeroDocumento).toBe('8227')
    expect(d.numeroParcela).toBe('001/003')
  })

  it('sem título no espelho, cai no número da nota e não inventa parcela', () => {
    const d = enriquecer(linha({ numero_NF: '4471', omie_cod_lancamento: '77' }), DIC, indexarTitulos([]))
    expect(d.numeroDocumento).toBe('4471')
    expect(d.parcelas).toEqual([])
    expect(d.parcelasPagas).toBe(0)
  })
})

describe('anexos', () => {
  it('coluna com VÁRIAS urls vira vários links (o bug do link concatenado)', () => {
    // era isto que produzia .../req-6378.pdf,%20https://... e 404 no navegador
    const a = anexosDaDespesa({
      anexo_nf: null, anexo_boleto: null, anexo_comprovante: null,
      anexo_requisicao: 'https://x/anexos/pagar/req-6378-1.pdf, https://x/requisicoes/6378-boleto_fornecedor-2.pdf, https://x/requisicoes/6378-recibo_fornecedor-3.pdf',
    })
    expect(a).toHaveLength(3)
    expect(a.every((i) => !i.url.includes(','))).toBe(true)
  })

  it('nomeia pelo arquivo, porque a coluna não diz o que é', () => {
    const a = anexosDaDespesa({
      anexo_nf: null, anexo_boleto: null, anexo_comprovante: null,
      anexo_requisicao: 'https://x/req-6378-1.pdf, https://x/6378-boleto_fornecedor-2.pdf, https://x/6378-recibo_fornecedor-3.pdf',
    })
    expect(a.map((i) => i.rotulo)).toEqual(['Requisição #6378', 'Boleto do fornecedor', 'Recibo do fornecedor'])
  })

  it('numera só o que repete e não duplica o mesmo arquivo', () => {
    const a = anexosDaDespesa({
      anexo_nf: 'https://x/nf.pdf', anexo_comprovante: null,
      // mesmo boleto listado nas duas colunas: uma entrada só
      anexo_boleto: 'https://x/6378-boleto_fornecedor-2.pdf, https://x/outro-boleto_fornecedor.pdf',
      anexo_requisicao: 'https://x/6378-boleto_fornecedor-2.pdf',
    })
    expect(a.map((i) => i.rotulo)).toEqual(['Nota fiscal', 'Boleto do fornecedor 1', 'Boleto do fornecedor 2'])
  })

  it('vazio e espaços não viram link fantasma', () => {
    expect(anexosDaDespesa({ anexo_nf: '', anexo_boleto: '  ,  ', anexo_requisicao: null, anexo_comprovante: null })).toEqual([])
  })
})

describe('link do Omie por empresa', () => {
  it('acha as duas empresas, com ou sem cedilha', () => {
    expect(urlOmieFinanceiro('Nova Tratores')).toContain('nova-')
    expect(urlOmieFinanceiro('Castro Peças')).toContain('castro-')
    // o nome é texto livre e já aparece escrito das duas formas no projeto
    expect(urlOmieFinanceiro('CASTRO PECAS')).toBe(urlOmieFinanceiro('Castro Peças'))
    expect(urlOmieFinanceiro(' castro peças ')).toBe(urlOmieFinanceiro('Castro Peças'))
  })

  it('cada empresa vai pro SEU endereço — nunca pro da outra', () => {
    expect(urlOmieFinanceiro('Nova Tratores')).not.toBe(urlOmieFinanceiro('Castro Peças'))
  })

  it('empresa desconhecida ou vazia não ganha botão', () => {
    // omitir o botão é melhor que abrir o financeiro da empresa errada
    expect(urlOmieFinanceiro('Outra Empresa')).toBeNull()
    expect(urlOmieFinanceiro(null)).toBeNull()
    expect(urlOmieFinanceiro('')).toBeNull()
  })
})

describe('log de alterações', () => {
  const log = (detalhes: Record<string, unknown>) => ({
    id: 1, user_nome: 'Vinicius', acao: 'editar', entidade_id: '82',
    entidade_label: 'Despesa #82', detalhes, created_at: '2026-08-21T18:00:00Z',
  })

  it('descreve a troca com os DOIS nomes, não com códigos', () => {
    expect(descreverLog(log({
      campo: 'omie_categoria',
      de: '2.08.01', deNome: 'Adiantamento a Fornecedores',
      para: '2.02.99', paraNome: 'Combustível',
    }))).toBe('Categoria alterada de "Adiantamento a Fornecedores" para "Combustível"')
  })

  it('primeira classificação não inventa um "de"', () => {
    expect(descreverLog(log({
      campo: 'omie_categoria', de: null, deNome: null, para: '2.02.99', paraNome: 'Combustível',
    }))).toBe('Categoria definida como "Combustível"')
  })

  it('categoria renomeada no Omie: cai no código em vez de mentir', () => {
    // guardamos código E nome justamente pra este caso
    expect(descreverLog(log({ campo: 'omie_categoria', de: null, deNome: null, para: '9.99.99', paraNome: '' })))
      .toBe('Categoria definida como "9.99.99"')
  })

  it('log de formato desconhecido ainda vira linha, em vez de sumir', () => {
    expect(descreverLog(log({ campo: 'outra_coisa' }))).toBe('Despesa editada')
  })
})

describe('resumo', () => {
  it('média mensal divide pelos meses do intervalo, não pelos meses com gasto', () => {
    const r = resumir(enr([linha({ valor: 300, data_vencimento: '2026-03-10' })]),
      ['2026-01', '2026-02', '2026-03'])
    expect(r.total).toBe(300)
    expect(r.mediaMensal).toBe(100)
    expect(r.mesMaisCaro).toEqual({ mes: '2026-03', label: 'mar/26', total: 300 })
  })

  it('conta o que está fora do Omie e o que está sem categoria', () => {
    const r = resumir(enr([
      linha({ valor: 100, omie_cod_lancamento: '1', omie_categoria: '2.05.02' }),
      linha({ valor: 40, omie_cod_lancamento: null, omie_categoria: null }),
      linha({ valor: 10, omie_cod_lancamento: null, status_envio: 'erro' }),
    ]), ['2026-08'])
    expect(r.foraDoOmie).toEqual({ qtd: 1, total: 40 })
    expect(r.comErroOmie).toBe(1)
    expect(r.semCategoria).toEqual({ qtd: 2, total: 50 })
    expect(r.ticketMedio).toBeCloseTo(50, 10)
  })
})
