// PDF da tela "Vendas por Modelo" (DRE e Comercial), gerado no cliente com
// jspdf + jspdf-autotable — mesmo padrão de src/lib/abastecimento/pdf.ts.
//
// Reproduz o que está na tela, respeitando TODOS os filtros (conta, período,
// métrica, família, modelo, busca, top, agrupamento, visualização):
//  - cabeçalho com os filtros;
//  - os 4 KPIs;
//  - o gráfico "Evolução mensal" como imagem (o canvas do Chart.js);
//  - a tabela modelo × meses, UMA TABELA POR ANO (12 meses + total do ano), com
//    o mesmo heatmap emerald da tela. Na visualização "Grade anual" entram
//    também as colunas de trimestre e os modelos ficam ordenados por total.
//
// Uma tabela por ano porque "desde jan/2023" dá 40+ meses: numa tabela só as
// colunas ficariam ilegíveis em A4 paisagem. As funções puras (rótulos,
// agrupamento por ano, níveis do heatmap) ficam exportadas pra teste.

const VERMELHO = [220, 38, 38]
const CINZA_TXT = [40, 40, 40]

// Heatmap emerald da tela (mesmos cortes 0.05/0.2/0.4/0.6/0.8 -> 50..500).
const EMERALD_RGB = {
  50: [236, 253, 245],
  100: [209, 250, 229],
  200: [167, 243, 208],
  300: [110, 231, 183],
  400: [52, 211, 153],
  500: [16, 185, 129],
}

// ---------------------------------------------------------------------------
// Formatadores — os MESMOS da tela (sem casas; curto arredondado).
// ---------------------------------------------------------------------------
export function fmtBRL(n) {
  return 'R$ ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(n) || 0)
}
export function fmtBRLcurto(n) {
  const v = Number(n) || 0
  const s = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1000000) return s + 'R$ ' + (a / 1000000).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1000) return s + 'R$ ' + Math.round(a / 1000) + 'k'
  return s + 'R$ ' + Math.round(a)
}
export function fmtN(n) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(n) || 0)
}

// ---------------------------------------------------------------------------
// Rótulos dos filtros (também usados no log de atividade da tela).
// ---------------------------------------------------------------------------
export function rotuloPeriodo(meses, desde) {
  if (meses === '__desde__') {
    const p = String(desde || '').split('-')
    if (p.length === 2) return 'desde ' + p[1] + '/' + p[0]
    return 'desde ' + (desde || '?')
  }
  return meses + ' meses'
}
export function rotuloFamilia(f) {
  if (!f) return 'Todas'
  if (f === '__TODAS_MAQUINAS__') return 'Todas as máquinas'
  if (f === '__SO_PECAS__') return 'Só peças'
  return f
}
export function rotuloMetrica(m) {
  return m === 'receita' ? 'Receita R$' : m === 'eventos' ? 'Nº de vendas' : 'Quantidade'
}
export function rotuloTop(top) {
  return top > 0 ? 'Top ' + top : 'Todos'
}
export function rotuloVisualizacao(v) {
  return v === 'grade' ? 'Grade anual' : 'Tabela'
}
export function rotuloAgrupamento(a) {
  return a === 'potencia' ? 'Por potência' : 'Por modelo'
}

// ---------------------------------------------------------------------------
// Puras: meses 'YYYY-MM' agrupados por ano (ordem crescente) e nível do heatmap.
// ---------------------------------------------------------------------------
export function agruparMesesPorAno(meses) {
  const porAno = {}
  ;(meses || []).slice().sort().forEach((k) => {
    const ano = k.split('-')[0]
    if (!porAno[ano]) porAno[ano] = []
    porAno[ano].push(k)
  })
  return Object.keys(porAno).sort().map((ano) => ({ ano: parseInt(ano, 10), meses: porAno[ano] }))
}

export function nivelHeatmap(v, max) {
  if (!(v > 0) || !(max > 0)) return 0
  const int = Math.min(1, v / max)
  return int < 0.05 ? 50 : int < 0.2 ? 100 : int < 0.4 ? 200 : int < 0.6 ? 300 : int < 0.8 ? 400 : 500
}

// Maior valor por célula entre os modelos (escala do heatmap, como na tela).
export function maxCelula(modelos, meses, metrica) {
  let mx = 0
  ;(modelos || []).forEach((m) => {
    ;(meses || []).forEach((k) => {
      const v = ((m.por_mes || {})[k] || {})[metrica] || 0
      if (v > mx) mx = v
    })
  })
  return mx
}

// Na grade anual os modelos vão por total desc (como construirSeriesGrade).
export function ordenarParaGrade(modelos, metrica) {
  return (modelos || []).slice().sort((a, b) => {
    const ta = a.totais[metrica] !== undefined ? a.totais[metrica] : a.totais.qtd
    const tb = b.totais[metrica] !== undefined ? b.totais[metrica] : b.totais.qtd
    return tb - ta
  })
}

const NOMES_MES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Linhas de uma tabela-ano: [modelo, (familia), m1..mN, (T1..T4), totalAno]
// + a linha TOTAL (soma dos totaisPorMes). Valores numéricos crus; a
// formatação fica no desenho (precisa do nível do heatmap por célula).
export function montarTabelaAno({ ano, mesesDoAno, modelos, totaisPorMes, metrica, comFamilia, comTrimestres }) {
  const cab = ['Modelo']
  if (comFamilia) cab.push('Família')
  mesesDoAno.forEach((k) => cab.push(NOMES_MES[parseInt(k.split('-')[1], 10)] + '/' + String(ano).slice(2)))
  if (comTrimestres) cab.push('T1', 'T2', 'T3', 'T4')
  cab.push('Total ' + ano)

  const linha = (nome, familia, valorDoMes) => {
    const r = [nome]
    if (comFamilia) r.push(familia || '')
    const trim = [0, 0, 0, 0]
    let tot = 0
    mesesDoAno.forEach((k) => {
      const v = valorDoMes(k)
      r.push(v)
      tot += v
      trim[Math.ceil(parseInt(k.split('-')[1], 10) / 3) - 1] += v
    })
    if (comTrimestres) trim.forEach((t) => r.push(t))
    r.push(tot)
    return r
  }

  const corpo = (modelos || []).map((m) =>
    linha(
      (m.modelo || '') + (m._membros && m._membros.length > 1 ? ' (' + m._membros.length + ')' : ''),
      m.familia,
      (k) => ((m.por_mes || {})[k] || {})[metrica] || 0,
    ),
  )
  const total = linha('TOTAL', '', (k) => ((totaisPorMes || {})[k] || {})[metrica] || 0)
  return { cabecalho: cab, corpo, total, primeiraColunaMes: comFamilia ? 2 : 1 }
}

// ---------------------------------------------------------------------------
// Geração do PDF.
// ---------------------------------------------------------------------------
export async function gerarPdfVendasModelo(opts) {
  const {
    contaLabel, meses, desde, metrica, familia, modelo, busca, top,
    visualizacao, agrupamento, dados, modelos, grafico, origem,
  } = opts
  const { default: JsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 12 // margem
  const ehReceita = metrica === 'receita'
  const fmtCel = (v) => (ehReceita ? fmtBRLcurto(v) : fmtN(v))
  const fmtTot = (v) => (ehReceita ? fmtBRL(v) : fmtN(v))

  // --- Cabeçalho -----------------------------------------------------------
  doc.setFontSize(14)
  doc.setTextColor(...VERMELHO)
  doc.setFont('helvetica', 'bold')
  doc.text('Nova Tratores — Vendas por Modelo', M, 14)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(110)
  doc.text('Receita e quantidade mês a mês, modelo a modelo' + (origem ? ' · ' + origem : ''), M, 19)

  const filtros = [
    'Conta: ' + contaLabel + '   ·   Período: ' + rotuloPeriodo(meses, desde) + '   ·   Métrica: ' + rotuloMetrica(metrica),
    'Família: ' + rotuloFamilia(familia) + '   ·   Modelo: ' + (modelo || 'Todos') + '   ·   Busca: ' + (busca ? '"' + busca + '"' : '—') + '   ·   ' + rotuloTop(top),
    'Visualização: ' + rotuloVisualizacao(visualizacao) + '   ·   Agrupamento: ' + rotuloAgrupamento(agrupamento)
      + '   ·   Gerado em ' + new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  ]
  doc.setFontSize(8.5)
  filtros.forEach((t, i) => doc.text(t, M, 24.5 + i * 4))
  let y = 24.5 + filtros.length * 4 + 3

  // --- KPIs ----------------------------------------------------------------
  const tg = (dados && dados.totaisGerais) || {}
  const kpis = [
    ['MODELOS DISTINTOS', fmtN(tg.modelos)],
    ['EVENTOS DE VENDA', fmtN(tg.eventos)],
    ['QUANTIDADE TOTAL', fmtN(tg.qtd)],
    ['RECEITA TOTAL', fmtBRL(tg.receita)],
  ]
  const gap = 4
  const kw = (W - 2 * M - gap * 3) / 4
  kpis.forEach(([rot, val], i) => {
    const x = M + i * (kw + gap)
    doc.setDrawColor(226, 232, 240)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(x, y, kw, 15, 1.5, 1.5, 'FD')
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text(rot, x + 3, y + 5)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    if (i === 3) doc.setTextColor(4, 120, 87); else doc.setTextColor(...CINZA_TXT)
    doc.text(val, x + 3, y + 11.5)
    doc.setFont('helvetica', 'normal')
  })
  y += 15 + 5

  // --- Gráfico (imagem do canvas) ------------------------------------------
  if (grafico && grafico.dataUrl && grafico.w > 0 && grafico.h > 0) {
    const gw = W - 2 * M
    const gh = Math.min(60, gw * (grafico.h / grafico.w))
    doc.setFontSize(7.5)
    doc.setTextColor(100, 116, 139)
    doc.text('EVOLUÇÃO MENSAL — ' + rotuloMetrica(metrica).toUpperCase() + ' (número na base da barra = quantidade do mês)', M, y)
    y += 2
    doc.setDrawColor(226, 232, 240)
    doc.rect(M, y, gw, gh + 4)
    doc.addImage(grafico.dataUrl, 'PNG', M + 2, y + 2, gw - 4, gh)
    y += gh + 4 + 6
  }

  // --- Tabelas por ano -----------------------------------------------------
  const ehGrade = visualizacao === 'grade'
  const lista = ehGrade ? ordenarParaGrade(modelos, metrica) : (modelos || [])
  const anos = agruparMesesPorAno(dados ? dados.meses : [])
  // Ordem da tela: grade mostra o ano mais recente em cima; tabela é cronológica.
  const anosOrdenados = ehGrade ? anos.slice().reverse() : anos
  const mx = maxCelula(lista, dados ? dados.meses : [], metrica)

  if (lista.length === 0 || anos.length === 0) {
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text('Nenhum modelo no filtro.', M, y + 6)
  }

  anosOrdenados.forEach((bloco) => {
    const t = montarTabelaAno({
      ano: bloco.ano, mesesDoAno: bloco.meses, modelos: lista,
      totaisPorMes: dados.totaisPorMes, metrica,
      comFamilia: !ehGrade, comTrimestres: ehGrade,
    })
    const nCols = t.cabecalho.length
    const idxTotal = nCols - 1
    const idxTrimIni = ehGrade ? nCols - 5 : -1

    // Título do bloco (com quebra de página se não couber o cabeçalho + 2 linhas)
    if (y > H - 30) { doc.addPage(); y = M }
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...CINZA_TXT)
    doc.text(String(bloco.ano) + '  —  ' + rotuloMetrica(metrica) + (ehGrade ? '  (ordenado por total)' : ''), M, y + 4)
    doc.setFont('helvetica', 'normal')

    const larguraModelo = ehGrade ? 40 : 36
    const larguraFamilia = ehGrade ? 0 : 26
    const colStyles = { 0: { cellWidth: larguraModelo, halign: 'left', fontStyle: 'bold' } }
    if (!ehGrade) colStyles[1] = { cellWidth: larguraFamilia, halign: 'left', textColor: [71, 85, 105] }
    colStyles[idxTotal] = { fontStyle: 'bold', fillColor: [241, 245, 249] }
    if (ehGrade) for (let i = idxTrimIni; i < idxTotal; i++) colStyles[i] = { fillColor: [248, 250, 252], textColor: [71, 85, 105] }

    autoTable(doc, {
      startY: y + 6,
      margin: { left: M, right: M },
      head: [t.cabecalho],
      body: t.corpo,
      foot: [t.total],
      styles: { fontSize: ehGrade ? 6.5 : 7, cellPadding: 1.1, halign: 'right', overflow: 'ellipsize', valign: 'middle' },
      headStyles: { fillColor: VERMELHO, textColor: 255, fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      columnStyles: colStyles,
      rowPageBreak: 'avoid',
      didParseCell: (d) => {
        const c = d.column.index
        const ehMes = c >= t.primeiraColunaMes && (ehGrade ? c < idxTrimIni : c < idxTotal)
        const ehTrim = ehGrade && c >= idxTrimIni && c < idxTotal
        const raw = d.cell.raw
        if (d.section === 'head') return
        if (typeof raw !== 'number') return
        if (c === idxTotal) { d.cell.text = [fmtTot(raw)]; return }
        if (ehTrim) { d.cell.text = [raw > 0 ? fmtCel(raw) : '-']; return }
        if (!ehMes) return
        if (!(raw > 0)) { d.cell.text = ['-']; d.cell.styles.textColor = [203, 213, 225]; return }
        d.cell.text = [fmtCel(raw)]
        if (d.section === 'body') {
          const lvl = nivelHeatmap(raw, mx)
          if (lvl) {
            d.cell.styles.fillColor = EMERALD_RGB[lvl]
            d.cell.styles.textColor = lvl >= 400 ? [255, 255, 255] : [30, 41, 59]
          }
        }
      },
    })
    y = doc.lastAutoTable.finalY + 7
  })

  // --- Rodapé --------------------------------------------------------------
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(150)
    doc.text('Vendas por Modelo · ' + contaLabel + ' · ' + rotuloPeriodo(meses, desde) + ' · ' + rotuloMetrica(metrica), M, H - 6)
    doc.text('Página ' + i + ' de ' + total, W - M, H - 6, { align: 'right' })
  }

  const hoje = new Date().toISOString().slice(0, 10)
  const nome = 'vendas-por-modelo_' + String(contaLabel || 'conta').toLowerCase() + '_' + metrica + '_' + (ehGrade ? 'grade' : 'tabela') + '_' + hoje + '.pdf'
  doc.save(nome)
  return nome
}
