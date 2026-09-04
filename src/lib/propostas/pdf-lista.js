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
 */
export async function gerarPdfLista({ titulo, colunas, linhas, filtrosResumo = [], rodape = [], arquivo, columnStyles = {} }) {
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
  const startY = 30 + filtrosLinhas.length * 3.5 + 2

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
