// Agregação da tela de Despesas — funções PURAS (sem React, sem rede).
//
// É aqui que mora tudo que precisa estar certo: a árvore mês→semana→dia, a
// série mensal e os rankings. Estar fora dos componentes é o que permite testar
// as invariantes no vitest — e o que torna mecânico mover isso pra uma rota de
// API no dia em que o volume justificar (hoje são 38 linhas).
//
// INVARIANTES (garantidas por teste):
//   soma(dias) === total(semana) · soma(semanas) === total(mês)
//   soma(meses) === total geral  · soma(ranking, incl. "Outros") === total
//
// SEMANA RECORTADA PELO MÊS: uma semana que cruza a virada aparece nos DOIS
// meses, cada ocorrência só com os dias daquele mês. É o que faz a soma das
// semanas fechar com o mês. A alternativa (jogar a semana toda no mês da
// segunda-feira) faria gasto de fevereiro aparecer somado em janeiro.

import { slugContraparte } from '@/lib/financeiro/rastreio/normalizar'
import { montarDicionario, resolverCategoria, SEM_CATEGORIA, type DicionarioCategorias, type LinhaCache } from './categorias'
import { codigosLancamento, estadoParcela, ordemParcela, situacaoOmie } from './omie'
import {
  primeiroDiaDoMes, rotuloDia, rotuloMes, rotuloMesCurto, rotuloSemana,
  segundaDaSemanaISO, somarDias, ultimoDiaDoMes,
} from './periodo'
import type {
  Despesa, DespesaRow, FatiaRanking, NoDia, NoMes, NoSemana, ParcelaOmie, PontoMes,
  ResumoDespesas, TituloOmie,
} from './tipos'

export { montarDicionario, SEM_CATEGORIA }
export type { DicionarioCategorias, LinhaCache }

const soma = (xs: { total: number }[]) => xs.reduce((s, x) => s + x.total, 0)

/** Títulos do Omie indexados por código de lançamento. */
export function indexarTitulos(titulos: TituloOmie[]): Map<string, TituloOmie> {
  const m = new Map<string, TituloOmie>()
  for (const t of titulos) m.set(String(t.codigo_lancamento), t)
  return m
}

/** Linha crua → linha enriquecida (categoria, fornecedor, Omie). */
export function enriquecer(
  row: DespesaRow,
  dic: DicionarioCategorias,
  titulos?: Map<string, TituloOmie>,
): Despesa {
  const { categoria, origem } = resolverCategoria(row, dic)
  const rotulo = String(row.fornecedor || '').trim()

  // parcelado gera UM LANÇAMENTO POR PARCELA no Omie: juntando todos dá pra
  // dizer quais já saíram sem ninguém abrir o Omie pra conferir
  const codigos = codigosLancamento(row)
  const daDespesa = titulos
    ? codigos.map((c) => ({ c, t: titulos.get(c) })).filter((x): x is { c: string; t: TituloOmie } => !!x.t)
    : []
  const parcelas: ParcelaOmie[] = daDespesa
    .map(({ c, t }) => ({
      numero: t.numero_parcela || '—',
      estado: estadoParcela(t.status_titulo),
      valor: Number(t.valor_documento) || 0,
      vencimento: t.data_vencimento,
      pagamento: t.data_pagamento,
      codigoLancamento: c,
    }))
    .sort((a, b) => ordemParcela(a.numero) - ordemParcela(b.numero))

  const titulo = daDespesa[0]?.t
  const doc = String(titulo?.numero_documento || titulo?.numero_documento_fiscal || '').trim()

  return {
    ...row,
    valorNum: Number(row.valor) || 0,
    categoria,
    origemCategoria: origem,
    fornecedorChave: slugContraparte(rotulo) || '(sem fornecedor)',
    fornecedorRotulo: rotulo || 'Sem fornecedor',
    situacaoOmie: situacaoOmie(row),
    // sem título no espelho, o número da nota é o melhor palpite — é o que o
    // portal manda pro Omie como numero_documento
    numeroDocumento: doc || String(row.numero_NF || '').trim() || null,
    numeroParcela: titulo?.numero_parcela || null,
    parcelas,
    parcelasPagas: parcelas.filter((p) => p.estado === 'paga').length,
  }
}

// ── Árvore mês → semana → dia ───────────────────────────────────────────────

export function montarArvore(despesas: Despesa[]): NoMes[] {
  // despesa sem vencimento não entra na árvore (o chamador trata à parte)
  const comData = despesas.filter((d) => !!d.data_vencimento)

  const porMes = new Map<string, Despesa[]>()
  for (const d of comData) {
    const mes = String(d.data_vencimento).slice(0, 7)
    const lista = porMes.get(mes)
    if (lista) lista.push(d)
    else porMes.set(mes, [d])
  }

  const meses = [...porMes.keys()].sort().reverse()
  return meses.map((mes) => {
    const itensMes = porMes.get(mes) as Despesa[]

    const porSemana = new Map<string, Despesa[]>()
    for (const d of itensMes) {
      const seg = segundaDaSemanaISO(String(d.data_vencimento).slice(0, 10))
      const lista = porSemana.get(seg)
      if (lista) lista.push(d)
      else porSemana.set(seg, [d])
    }

    const semanas: NoSemana[] = [...porSemana.keys()]
      .sort()
      .reverse()
      .map((seg) => {
        const itensSemana = porSemana.get(seg) as Despesa[]
        // recorte pelo mês: a semana só exibe (e só soma) os dias deste mês
        const inicio = seg < primeiroDiaDoMes(mes) ? primeiroDiaDoMes(mes) : seg
        const domingo = somarDias(seg, 6)
        const fimMes = ultimoDiaDoMes(mes)
        const fim = domingo > fimMes ? fimMes : domingo

        const porDia = new Map<string, Despesa[]>()
        for (const d of itensSemana) {
          const dia = String(d.data_vencimento).slice(0, 10)
          const lista = porDia.get(dia)
          if (lista) lista.push(d)
          else porDia.set(dia, [d])
        }

        const dias: NoDia[] = [...porDia.keys()]
          .sort()
          .reverse()
          .map((dia) => {
            const itens = (porDia.get(dia) as Despesa[])
              .slice()
              .sort((a, b) => b.valorNum - a.valorNum)
            const { numero, diaSemana } = rotuloDia(dia)
            return { dia, numero, diaSemana, total: itens.reduce((s, i) => s + i.valorNum, 0), itens }
          })

        return {
          segunda: seg,
          inicio,
          fim,
          label: rotuloSemana(inicio, fim),
          total: soma(dias),
          qtd: itensSemana.length,
          dias,
        }
      })

    return { mes, label: rotuloMes(mes), total: soma(semanas), qtd: itensMes.length, semanas }
  })
}

// ── Série mensal ────────────────────────────────────────────────────────────

/** Um ponto por mês do intervalo, INCLUSIVE os sem despesa (senão o gráfico
 *  pula meses e a tendência mente). `mesCorrente` sai marcado como parcial. */
export function serieMensal(despesas: Despesa[], meses: string[], mesCorrente: string): PontoMes[] {
  const acc = new Map<string, { total: number; qtd: number }>()
  for (const d of despesas) {
    if (!d.data_vencimento) continue
    const mes = String(d.data_vencimento).slice(0, 7)
    const a = acc.get(mes) || { total: 0, qtd: 0 }
    a.total += d.valorNum
    a.qtd += 1
    acc.set(mes, a)
  }
  return meses.map((mes) => {
    const a = acc.get(mes) || { total: 0, qtd: 0 }
    return { mes, label: rotuloMesCurto(mes), total: a.total, qtd: a.qtd, parcial: mes === mesCorrente }
  })
}

// ── Rankings (categoria, fornecedor) ────────────────────────────────────────

/** Top N por valor + balde "Outros (N)". A soma do resultado é SEMPRE o total
 *  do conjunto — gráfico que esconde dinheiro mente sobre o tamanho do todo. */
export function ranking(
  despesas: Despesa[],
  chaveDe: (d: Despesa) => string,
  rotuloDe: (d: Despesa) => string,
  topN: number,
): FatiaRanking[] {
  const acc = new Map<string, { total: number; qtd: number; rotulos: Map<string, number> }>()
  for (const d of despesas) {
    const k = chaveDe(d)
    const a = acc.get(k) || { total: 0, qtd: 0, rotulos: new Map<string, number>() }
    a.total += d.valorNum
    a.qtd += 1
    const r = rotuloDe(d)
    a.rotulos.set(r, (a.rotulos.get(r) || 0) + 1)
    acc.set(k, a)
  }

  const totalGeral = [...acc.values()].reduce((s, a) => s + a.total, 0)

  const todos = [...acc.entries()]
    .map(([chave, a]) => {
      // rótulo = grafia mais frequente; empate vence a mais longa, que em nome
      // de fornecedor costuma ser a razão social completa
      const variantes = [...a.rotulos.entries()]
        .sort((x, y) => y[1] - x[1] || y[0].length - x[0].length)
        .map(([r]) => r)
      return {
        chave,
        rotulo: variantes[0] || chave,
        total: a.total,
        qtd: a.qtd,
        percentual: totalGeral > 0 ? a.total / totalGeral : 0,
        variantes,
        ehOutros: false,
      }
    })
    .sort((a, b) => b.total - a.total)

  // `<= topN + 1`: quando sobra UM só na cauda, mostrar "Outros (1)" ocuparia
  // exatamente a mesma linha da categoria de verdade, dizendo menos. Só vale
  // agrupar quando o balde realmente resume mais de um.
  if (todos.length <= topN + 1) return todos

  const cabeca = todos.slice(0, topN)
  const cauda = todos.slice(topN)
  const totalCauda = cauda.reduce((s, x) => s + x.total, 0)
  cabeca.push({
    chave: '__outros__',
    rotulo: `Outros (${cauda.length})`,
    total: totalCauda,
    qtd: cauda.reduce((s, x) => s + x.qtd, 0),
    percentual: totalGeral > 0 ? totalCauda / totalGeral : 0,
    variantes: cauda.map((x) => x.rotulo),
    ehOutros: true,
  })
  return cabeca
}

export const rankingCategorias = (d: Despesa[], topN = 7) =>
  ranking(d, (x) => x.categoria, (x) => x.categoria, topN)

export const rankingFornecedores = (d: Despesa[], topN = 10) =>
  ranking(d, (x) => x.fornecedorChave, (x) => x.fornecedorRotulo, topN)

// ── Resumo ──────────────────────────────────────────────────────────────────

export function resumir(despesas: Despesa[], meses: string[]): ResumoDespesas {
  const total = despesas.reduce((s, d) => s + d.valorNum, 0)
  const qtd = despesas.length

  const porMes = new Map<string, number>()
  for (const d of despesas) {
    if (!d.data_vencimento) continue
    const m = String(d.data_vencimento).slice(0, 7)
    porMes.set(m, (porMes.get(m) || 0) + d.valorNum)
  }
  let mesMaisCaro: ResumoDespesas['mesMaisCaro'] = null
  for (const [mes, t] of porMes) {
    if (!mesMaisCaro || t > mesMaisCaro.total) mesMaisCaro = { mes, label: rotuloMesCurto(mes), total: t }
  }

  const fora = despesas.filter((d) => d.situacaoOmie === 'fora')
  const semCat = despesas.filter((d) => d.categoria === SEM_CATEGORIA)

  return {
    total,
    qtd,
    ticketMedio: qtd > 0 ? total / qtd : 0,
    // divide pelos meses do INTERVALO, não pelos meses com gasto: mês sem
    // despesa é informação, não ausência de dado
    mediaMensal: meses.length > 0 ? total / meses.length : 0,
    mesMaisCaro,
    foraDoOmie: { qtd: fora.length, total: fora.reduce((s, d) => s + d.valorNum, 0) },
    comErroOmie: despesas.filter((d) => d.situacaoOmie === 'erro').length,
    semCategoria: { qtd: semCat.length, total: semCat.reduce((s, d) => s + d.valorNum, 0) },
  }
}
