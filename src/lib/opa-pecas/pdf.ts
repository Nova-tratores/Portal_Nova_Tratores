// Catálogo em PDF das Peças Não Identificadas (para comprador / ferro-velho):
// miniatura da 1ª foto, código, descrição, aplicação, qualidade, quantidade e
// preço — exatamente a lista filtrada da tela. jsPDF + autotable no navegador.

import { urlsMiniaturas } from './fotos'
import { codigoDefinitivo, fmtPreco, textoAplicacoes } from './regras'
import { ROTULO_QUALIDADE, ROTULO_STATUS, type Item, type Nomes } from './tipos'

const COR: [number, number, number] = [220, 38, 38]
const FOTO_MM = 24

async function paraDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const blob = await r.blob()
    return await new Promise((ok) => {
      const fr = new FileReader()
      fr.onload = () => ok(typeof fr.result === 'string' ? fr.result : null)
      fr.onerror = () => ok(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** Baixa as miniaturas (até 6 em paralelo). Foto que falhar sai em branco — não derruba o PDF. */
async function miniaturas(itens: Item[]): Promise<Record<string, string>> {
  const paths = itens.map((i) => i.fotos[0]?.storage_path).filter((p): p is string => !!p)
  const urls = await urlsMiniaturas(paths)
  const r: Record<string, string> = {}
  let idx = 0
  const trabalhar = async () => {
    while (idx < paths.length) {
      const p = paths[idx++]
      if (!urls[p]) continue
      const d = await paraDataUrl(urls[p])
      if (d) r[p] = d
    }
  }
  await Promise.all(Array.from({ length: 6 }, trabalhar))
  return r
}

export async function gerarPdfCatalogo(a: { itens: Item[]; nomes: Nomes; filtros: string[]; comStatus?: boolean }) {
  const [{ default: JsPDF }, { default: autoTable }, fotos] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), miniaturas(a.itens),
  ])
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const larg = doc.internal.pageSize.getWidth()

  doc.setFillColor(...COR)
  doc.rect(0, 0, larg, 18, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('NOVA TRATORES MAQUINAS AGRICOLAS LTDA.', 12, 12)
  doc.setFontSize(9)
  doc.text('Catálogo de peças', larg - 12, 12, { align: 'right' })

  doc.setTextColor(90, 90, 90)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  const agora = new Date()
  const unidades = a.itens.reduce((s, i) => s + i.quantidade, 0)
  doc.text(`Gerado em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 12, 24)
  doc.text(`${a.itens.length} ite${a.itens.length === 1 ? 'm' : 'ns'} · ${unidades} unidade${unidades === 1 ? '' : 's'}`, larg - 12, 24, { align: 'right' })
  const filtrosTxt = doc.splitTextToSize(a.filtros.length ? `Filtros: ${a.filtros.join('  ·  ')}` : 'Filtros: nenhum (lista completa)', larg - 24)
  doc.text(filtrosTxt, 12, 29)
  const inicio = 29 + filtrosTxt.length * 3.5 + 2

  const cabecalho = ['Foto', 'Código', 'Descrição', 'Aplicação', 'Qualidade', 'Qtd', 'Preço un.']
  if (a.comStatus) cabecalho.push('Status')
  const corpo = a.itens.map((i) => {
    const linha = [
      '',
      (codigoDefinitivo(i.codigo) ? i.codigo : 'Sem código') + (i.codigo_fabricante ? `\nFab.: ${i.codigo_fabricante}` : ''),
      i.descricao || 'Sem descrição',
      textoAplicacoes(i, a.nomes) || '—',
      ROTULO_QUALIDADE[i.qualidade],
      String(i.quantidade),
      i.preco_sugerido == null ? 'A consultar' : fmtPreco(i.preco_sugerido),
    ]
    if (a.comStatus) linha.push(ROTULO_STATUS[i.status])
    return linha
  })

  autoTable(doc, {
    startY: inicio,
    head: [cabecalho],
    body: corpo,
    margin: { left: 12, right: 12 },
    styles: { fontSize: 8, cellPadding: 1.6, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: COR, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: FOTO_MM + 2, minCellHeight: FOTO_MM + 2 },
      1: { cellWidth: 26, fontStyle: 'bold' },
      4: { cellWidth: 20 },
      5: { cellWidth: 10, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
    },
    didDrawCell: (d) => {
      if (d.section !== 'body' || d.column.index !== 0) return
      const path = a.itens[d.row.index]?.fotos[0]?.storage_path
      const img = path ? fotos[path] : null
      if (!img) return
      try {
        const props = doc.getImageProperties(img)
        const escala = Math.min(FOTO_MM / props.width, FOTO_MM / props.height)
        const w = props.width * escala
        const h = props.height * escala
        doc.addImage(img, 'JPEG', d.cell.x + (d.cell.width - w) / 2, d.cell.y + (d.cell.height - h) / 2, w, h)
      } catch { /* foto ilegível: célula fica em branco */ }
    },
  })

  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    doc.setFontSize(7.5)
    doc.setTextColor(140, 140, 140)
    doc.text(`Página ${p} de ${paginas} · Preços sugeridos, sujeitos a confirmação`, larg / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' })
  }
  doc.save(`catalogo-pecas-${agora.toISOString().slice(0, 10)}.pdf`)
}
