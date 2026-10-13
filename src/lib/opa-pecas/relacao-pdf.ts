// PDF da Relação Opa × cadastro (navegador, jsPDF + autotable): A4 deitado,
// duas seções — "Já cadastrados no sistema" e "Só no Opa".

import { fmtPreco } from './regras'
import { ROTULO_MOTIVO, textoCaracteristicas, type ItemRelacao, type Relacao } from './relacao'
import { ROTULO_QUALIDADE, ROTULO_STATUS } from './tipos'

const LARANJA: [number, number, number] = [234, 88, 12]

export async function gerarPdfRelacao(r: Relacao, local: (i: ItemRelacao) => string, filtro?: string) {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const larg = doc.internal.pageSize.getWidth()

  doc.setFillColor(...LARANJA)
  doc.rect(0, 0, larg, 18, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('Peças S/Estoque — Relação com o cadastro', 12, 12)
  doc.setFontSize(9)
  doc.text(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), larg - 12, 12, { align: 'right' })
  doc.setTextColor(60, 60, 60)
  doc.setFont('helvetica', 'normal')
  doc.text(`${r.existentes.length} já cadastrada(s) · ${r.soOpa.length} só no Opa${filtro ? ` · busca: "${filtro}"` : ''}`, 12, 25)

  // embalagem errada: o código da embalagem e, embaixo, o correto (é com ele que o cadastro foi achado)
  const codigoExistente = (i: ItemRelacao) => [i.codigo_fabricante || '—', i.codigo_correto ? `Embalagem errada\ncorreto: ${i.codigo_correto}` : ''].filter(Boolean).join('\n')
  const opa = (i: ItemRelacao) => `${i.codigo}\n${i.descricao || '—'}\n${i.quantidade} un · ${ROTULO_QUALIDADE[i.qualidade]} · ${ROTULO_STATUS[i.status]}`
  const estilo = { fontSize: 7.5, cellPadding: 1.6, valign: 'top' as const, overflow: 'linebreak' as const }
  const cab = { fillColor: LARANJA, textColor: 255, fontStyle: 'bold' as const, fontSize: 7.5 }

  let y = 30
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(17, 17, 17)
  doc.text(`Já cadastrados no sistema (${r.existentes.length})`, 12, y)
  autoTable(doc, {
    startY: y + 2, margin: { left: 12, right: 12 }, styles: estilo, headStyles: cab,
    head: [['Peça no Opa', 'Código existente', 'Local (Opa)', 'Empresa', 'Descrição e características no cadastro', 'Tipo', 'Locação', 'Estoque', 'Valor unit.', 'Marca']],
    body: r.existentes.flatMap((l) => l.cadastros.map((c, n) => [
      n === 0 ? opa(l.item) : '', n === 0 ? codigoExistente(l.item) : '', n === 0 ? local(l.item) : '',
      c.empresa + (c.inativo ? ' (inativo)' : ''), [c.descricao || '—', textoCaracteristicas(c)].filter(Boolean).join('\n'), c.tipo || '—', c.locacao || '—',
      c.estoque == null ? '—' : String(c.estoque).replace('.', ','), c.valor_unitario == null ? '—' : fmtPreco(c.valor_unitario), c.marca || '—',
    ])),
    columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 26 }, 2: { cellWidth: 28 }, 3: { cellWidth: 17 }, 4: { cellWidth: 52 }, 7: { halign: 'right' }, 8: { halign: 'right' } },
  })

  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 10
  if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 16 }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(17, 17, 17)
  doc.text(`Só no Opa — sem cadastro (${r.soOpa.length})`, 12, y)
  autoTable(doc, {
    startY: y + 2, margin: { left: 12, right: 12 }, styles: estilo, headStyles: cab,
    head: [['Código Opa', 'Descrição', 'Código existente', 'Por quê', 'Qtde', 'Qualidade', 'Status', 'Local', 'Preço sugerido']],
    body: r.soOpa.map((l) => [
      l.item.codigo, l.item.descricao || '—', codigoExistente(l.item), ROTULO_MOTIVO[l.motivo || 'sem_codigo'],
      String(l.item.quantidade), ROTULO_QUALIDADE[l.item.qualidade], ROTULO_STATUS[l.item.status], local(l.item),
      l.item.preco_sugerido == null ? '—' : fmtPreco(l.item.preco_sugerido),
    ]),
    columnStyles: { 1: { cellWidth: 70 }, 4: { halign: 'right' }, 8: { halign: 'right' } },
  })

  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120)
    doc.text(`Página ${p} de ${total}`, larg - 12, doc.internal.pageSize.getHeight() - 6, { align: 'right' })
  }
  doc.save(`relacao-pecas-opa-${new Date().toISOString().slice(0, 10)}.pdf`)
}
