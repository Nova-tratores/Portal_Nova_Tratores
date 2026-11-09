// Demonstrativo de dívida atualizada (tela /financeiro/contas-cliente, 09/11/2026).
// Gerado no navegador (jsPDF + autotable, como os outros PDFs de lista do portal).
// Só demonstrativo: nada aqui é boleto nem vai para a Omie.
import type { Consolidado, RegraJuros } from './divida';

export interface DadosDemonstrativo {
  empresa: string;          // "Nova Tratores" | "Castro Peças"
  cliente: string;
  documento: string | null;
  dataBase: string;         // YYYY-MM-DD
  regra: RegraJuros;
  consolidado: Consolidado;
  titulos: { id: string; numero: string; vencimento: string | null; valorOriginal: number }[];
  emitidoPor: string;
}

export const brl = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dataBR = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const pct = (n: number) => `${String(Number(n.toFixed(3))).replace('.', ',')} %`;

export function descreverRegra(r: RegraJuros): string {
  const partes = [`multa de ${pct(r.multa_pct)}`, `juros ${r.tipo_juros === 'composto' ? 'compostos' : 'simples'} de ${pct(r.juros_mes_pct)} ao mês, pro-rata por dia`];
  if (r.carencia_dias > 0) partes.push(`carência de ${r.carencia_dias} dia(s)`);
  if (r.desconto_pct > 0) partes.push(`desconto de ${pct(r.desconto_pct)} sobre multa e juros`);
  return partes.join(', ');
}

/** Texto curto para colar no WhatsApp. */
export function resumoTexto(d: DadosDemonstrativo): string {
  const c = d.consolidado;
  const linhas = [
    `*${d.empresa} — demonstrativo de débito*`,
    `${d.cliente}${d.documento ? ` (${d.documento})` : ''}`,
    `${d.titulos.length} título(s) — valor original ${brl(c.principal)}`,
    `Multa ${brl(c.multa)} · Juros ${brl(c.juros)}${c.desconto > 0 ? ` · Desconto ${brl(c.desconto)}` : ''}`,
    `*Total atualizado: ${brl(c.total)}* (válido para pagamento até ${dataBR(d.dataBase)})`,
  ];
  if (c.parcelas.length > 1) {
    linhas.push(`Parcelamento: ${c.parcelas.map((p) => `${p.numero}ª ${brl(p.valor)} em ${dataBR(p.vencimento)}`).join(' · ')}`);
  }
  return linhas.join('\n');
}

const fimTabela = (doc: unknown) => (doc as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

export async function gerarDemonstrativoPdf(d: DadosDemonstrativo): Promise<Blob> {
  const { default: JsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const c = d.consolidado;

  doc.setFillColor(5, 150, 105);
  doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Demonstrativo de débito atualizado', M, 10);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(d.empresa, M, 16.5);
  doc.text(`Data-base: ${dataBR(d.dataBase)}`, W - M, 16.5, { align: 'right' });

  doc.setTextColor(17, 17, 17);
  let y = 31;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(d.cliente, M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  if (d.documento) { y += 5; doc.text(`CPF/CNPJ: ${d.documento}`, M, y); }
  y += 6;
  const regra = doc.splitTextToSize(`Regra aplicada: ${descreverRegra(d.regra)}.`, W - 2 * M);
  doc.setTextColor(80, 80, 80);
  doc.text(regra, M, y);
  y += regra.length * 4.4 + 2;

  const porId = new Map(c.itens.map((i) => [i.id, i]));
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Título', 'Vencimento', 'Dias', 'Valor em aberto', 'Multa', 'Juros', 'Atualizado']],
    body: d.titulos.map((t) => {
      const i = porId.get(t.id);
      return [t.numero, dataBR(t.vencimento), String(i?.dias ?? 0), brl(i?.principal ?? t.valorOriginal), brl(i?.multa ?? 0), brl(i?.juros ?? 0), brl(i?.total ?? t.valorOriginal)];
    }),
    foot: [['Total', '', '', brl(c.principal), brl(c.multa), brl(c.juros), brl(c.principal + c.multa + c.juros)]],
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    headStyles: { fillColor: [17, 17, 17], textColor: 255 },
    footStyles: { fillColor: [236, 253, 245], textColor: 17, fontStyle: 'bold' },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
  });
  y = fimTabela(doc) + 8;

  const linhaTotal = (rotulo: string, valor: string, destaque = false) => {
    doc.setFont('helvetica', destaque ? 'bold' : 'normal');
    doc.setFontSize(destaque ? 12 : 10);
    doc.text(rotulo, W - M - 70, y);
    doc.text(valor, W - M, y, { align: 'right' });
    y += destaque ? 7 : 5.5;
  };
  doc.setTextColor(17, 17, 17);
  linhaTotal('Valor original em aberto', brl(c.principal));
  linhaTotal('Multa', brl(c.multa));
  linhaTotal('Juros', brl(c.juros));
  if (c.desconto > 0) linhaTotal('Desconto', `- ${brl(c.desconto)}`);
  linhaTotal('Total atualizado', brl(c.total), true);

  if (c.parcelas.length > 1) {
    y += 3;
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Parcela', 'Vencimento', 'Valor']],
      body: c.parcelas.map((p) => [`${p.numero}/${c.parcelas.length}`, dataBR(p.vencimento), brl(p.valor)]),
      styles: { fontSize: 9, cellPadding: 1.8 },
      headStyles: { fillColor: [5, 150, 105], textColor: 255 },
      columnStyles: { 2: { halign: 'right' } },
      tableWidth: 110,
    });
    y = fimTabela(doc) + 6;
  }

  y += 4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90, 90, 90);
  const obs = doc.splitTextToSize(
    `Valores válidos para pagamento até ${dataBR(d.dataBase)}. Após essa data, os encargos são recalculados. ` +
    'Este documento é um demonstrativo e não substitui o boleto ou a nota fiscal.', W - 2 * M);
  doc.text(obs, M, y);

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);
    const H = doc.internal.pageSize.getHeight();
    doc.text(`Emitido por ${d.emitidoPor} em ${new Date().toLocaleString('pt-BR')}`, M, H - 8);
    doc.text(`Página ${p} de ${paginas}`, W - M, H - 8, { align: 'right' });
  }
  return doc.output('blob');
}
