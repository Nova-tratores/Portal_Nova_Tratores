/**
 * Gera um PDF (A4 paisagem) com a relação que está NA TELA do módulo /propostas.
 * Usado pelo Kanban (Propostas Cliente) e pelo FactoryKanban (Pedidos Fábrica).
 * Visual = o do relatório "em aberto" do page.jsx (faixa vermelha + tabela grid).
 *
 * @param {Object} p
 * @param {string}   p.titulo         Título à direita da faixa vermelha
 * @param {string[]} p.colunas        Cabeçalhos da tabela
 * @param {string[][]} p.linhas       Linhas já em texto (mesma ordem da tela)
 * @param {string[]} [p.filtrosResumo] Filtros ativos (aparecem no sub-header)
 * @param {{texto:string, destaque?:boolean}[]} [p.rodape] Totais abaixo da tabela
 * @param {string}   p.arquivo        Nome do arquivo .pdf
 * @param {Object}   [p.columnStyles] columnStyles do jspdf-autotable
 * @param {{label:string, fill:number[], text:number[]}[]} [p.legenda] Legenda de etapas (quadradinhos coloridos acima da tabela)
 * @param {(i:number)=>({fill:number[], text:number[], linha?:number[]}|null)} [p.estiloLinha] Cor da etapa por linha (índice em `linhas`)
 * @param {number}   [p.colStatus]     Índice da coluna que recebe a cor forte (a célula de Status)
 */
export async function gerarPdfLista({ titulo, colunas, linhas, filtrosResumo = [], rodape = [], arquivo, columnStyles = {}, legenda = [], estiloLinha = null, colStatus = -1 }) {
  const { default: JsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // Faixa vermelha
  doc.setFillColor(220, 38, 38)
  doc.rect(0, 0, pageWidth, 18, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('NOVA TRATORES MAQUINAS AGRICOLAS LTDA.', 14, 12)
  doc.setFontSize(8)
  doc.text(titulo, pageWidth - 14, 12, { align: 'right' })

  // Sub-header: gerado em / total / filtros
  doc.setTextColor(100, 100, 100)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const agora = new Date()
  doc.text(`Gerado em: ${agora.toLocaleDateString('pt-BR')} as ${agora.toLocaleTimeString('pt-BR')}`, 14, 25)
  doc.text(`Total: ${linhas.length} registro${linhas.length !== 1 ? 's' : ''}`, pageWidth - 14, 25, { align: 'right' })
  doc.setFontSize(8)
  const filtrosTxt = filtrosResumo.length ? `Filtros da tela: ${filtrosResumo.join('  ·  ')}` : 'Filtros da tela: nenhum (relação completa)'
  const filtrosLinhas = doc.splitTextToSize(filtrosTxt, pageWidth - 28)
  doc.text(filtrosLinhas, 14, 30)
  let startY = 30 + filtrosLinhas.length * 3.5 + 2

  // Legenda das etapas: ■ label ■ label … (mesmas cores da tela)
  if (legenda.length) {
    let x = 14
    const y = startY + 1
    doc.setFontSize(7.5)
    doc.setTextColor(90, 90, 90)
    doc.text('Etapas:', x, y + 2.6)
    x += doc.getTextWidth('Etapas:') + 3
    for (const l of legenda) {
      const w = doc.getTextWidth(l.label) + 5
      if (x + w + 4 > pageWidth - 14) break
      doc.setFillColor(...l.fill)
      doc.setDrawColor(...l.text)
      doc.roundedRect(x, y - 0.4, w, 4.4, 1, 1, 'FD')
      doc.setTextColor(...l.text)
      doc.text(l.label, x + 2.5, y + 2.6)
      x += w + 3
    }
    startY += 8
  }

  autoTable(doc, {
    startY,
    head: [colunas],
    body: linhas,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.5, font: 'helvetica', overflow: 'linebreak' },
    headStyles: { fillColor: [39, 39, 42], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles,
    margin: { left: 8, right: 8, bottom: 14 },
    // Cor da etapa: célula de Status pintada como o selo da tela; resto da linha num tom claro da mesma cor.
    didParseCell: estiloLinha ? (data) => {
      if (data.section !== 'body') return
      const e = estiloLinha(data.row.index)
      if (!e) return
      if (data.column.index === colStatus) {
        data.cell.styles.fillColor = e.fill
        data.cell.styles.textColor = e.text
        data.cell.styles.fontStyle = 'bold'
      } else if (e.linha) {
        data.cell.styles.fillColor = e.linha
      }
    } : undefined,
  })

  // Totais (à direita, abaixo da tabela; pula de página se não couber)
  if (rodape.length) {
    let y = (doc.lastAutoTable?.finalY || startY) + 8
    if (y + rodape.length * 6 > pageHeight - 14) { doc.addPage(); y = 20 }
    for (const r of rodape) {
      if (r.destaque) { doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38) }
      else { doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100) }
      doc.text(r.texto, pageWidth - 14, y, { align: 'right' })
      y += 6
    }
  }

  // "Página X de Y"
  const totalPag = doc.getNumberOfPages()
  for (let i = 1; i <= totalPag; i++) {
    doc.setPage(i)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(150)
    doc.text(`Pagina ${i} de ${totalPag}`, pageWidth - 14, pageHeight - 6, { align: 'right' })
  }

  doc.save(arquivo)
}

/** Data de hoje como YYYY-MM-DD (para nome de arquivo). */
export const hojeISO = () => new Date().toISOString().slice(0, 10)
