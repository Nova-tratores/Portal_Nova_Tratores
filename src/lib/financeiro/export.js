export async function exportToPDF(data, config) {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF('landscape')

  // Header
  doc.setFontSize(20)
  doc.setTextColor(30, 41, 59)
  doc.text(config.title || 'Relatório', 14, 20)

  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 14, 28)

  // Filters
  let startY = 36
  if (config.filters && Object.keys(config.filters).length > 0) {
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    Object.entries(config.filters).forEach(([key, value]) => {
      if (value) {
        doc.text(`${key}: ${value}`, 14, startY)
        startY += 5
      }
    })
    startY += 3
  }

  // Table
  autoTable(doc, {
    head: [config.columns.map(c => c.label)],
    body: data.map(row => config.columns.map(c => {
      const val = c.format ? c.format(row[c.key]) : row[c.key]
      return val ?? '-'
    })),
    startY,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  })

  // Footer
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(`Sistema Financeiro Nova Tratores — Página ${i} de ${pageCount}`, 14, doc.internal.pageSize.height - 10)
  }

  doc.save(config.filename || 'relatorio.pdf')
}

export async function exportToExcel(data, config) {
  const XLSX = await import('xlsx')

  const formatted = data.map(row => {
    const obj = {}
    config.columns.forEach(col => {
      obj[col.label] = col.format ? col.format(row[col.key]) : (row[col.key] ?? '-')
    })
    return obj
  })

  const ws = XLSX.utils.json_to_sheet(formatted)

  // Column widths
  ws['!cols'] = config.columns.map(col => ({ wch: Math.max(col.label.length + 4, 15) }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, config.sheetName || 'Dados')

  XLSX.writeFile(wb, config.filename || 'relatorio.xlsx')
}
