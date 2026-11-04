// Frota > Manutenções — PDF detalhado (jsPDF + autotable no cliente, mesmo
// padrão de lib/abastecimento/pdf.ts). Respeita o que a tela está mostrando
// (busca, período, vendidos/arquivados): 1) resumo por veículo; 2) cada
// veículo com TODOS os serviços (requisição, Rota Exata, portal) e subtotal;
// 3) total por origem.
import { formatarPlaca } from './placa';
import { ROTULO_ORIGEM, totaisPorOrigem, type ServicoRelatorio } from './manutencoes-relatorio';

const AZUL: [number, number, number] = [30, 64, 175]; // #1e40af (Frota)

export type VeiculoRelatorio = {
  placa: string;
  modelo: string | null;
  status: string | null;
  itens: ServicoRelatorio[];
  total: number;
  ultima: string | null;
};

const fmtRS = (v: number | null | undefined) =>
  v == null || !Number.isFinite(Number(v)) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (s: string | null) => {
  if (!s) return '—';
  const [a, m, d] = s.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};
const fmtKm = (v: number | null) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }));

export async function gerarPdfManutencoes(opts: { veiculos: VeiculoRelatorio[]; filtros: string[] }) {
  const { default: JsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const alturaPag = doc.internal.pageSize.getHeight();
  const estilo = {
    styles: { fontSize: 7.8, cellPadding: 1.6, valign: 'top' as const },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' as const },
    footStyles: { fillColor: [241, 245, 249] as [number, number, number], textColor: 30, fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
    margin: { left: 12, right: 12 },
  };

  // cabeçalho
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...AZUL);
  doc.text('Nova Tratores — Frota', 12, 15);
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text('Relatório de Manutenções (detalhado)', 12, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100);
  const info = [...opts.filtros, `Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`];
  info.forEach((t, i) => doc.text(t, 12, 27.5 + i * 4));
  let y = 27.5 + info.length * 4 + 2;

  const todos = opts.veiculos.flatMap((v) => v.itens);
  const totalGeral = opts.veiculos.reduce((s, v) => s + v.total, 0);
  const cont = (v: VeiculoRelatorio, o: string) => v.itens.filter((i) => i.origem === o).length || '';

  // 1) resumo
  autoTable(doc, {
    ...estilo,
    startY: y,
    head: [['Placa', 'Veículo', 'Serviços', 'Requisição', 'Rota Exata', 'Portal', 'Última', 'Total']],
    body: opts.veiculos.map((v) => [
      formatarPlaca(v.placa),
      `${v.modelo || '—'}${v.status === 'vendido' ? ' (vendido)' : v.status === 'arquivado' ? ' (arquivado)' : ''}`,
      v.itens.length, cont(v, 'requisicao'), cont(v, 'rotaexata'), cont(v, 'manual'),
      fmtData(v.ultima), fmtRS(v.total),
    ]),
    foot: [[{ content: `${opts.veiculos.length} veículo(s)`, colSpan: 2 }, todos.length, '', '', '', '', fmtRS(totalGeral)]],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 24 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
  });

  // 2) cada veículo com todos os serviços
  for (const v of opts.veiculos) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 9;
    if (y > alturaPag - 35) { doc.addPage(); y = 16; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...AZUL);
    doc.text(`${formatarPlaca(v.placa)}  ·  ${v.modelo || '—'}`, 12, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100);
    doc.text(`${v.itens.length} serviço(s) · total ${fmtRS(v.total)}`, 285, y, { align: 'right' });

    autoTable(doc, {
      ...estilo,
      startY: y + 2,
      head: [['Data', 'Origem', 'Serviço / o que foi feito', 'Fornecedor', 'Km', 'Valor']],
      body: v.itens.map((s) => {
        const partes = [s.descricao || s.tipo || '—'];
        if (s.detalhe) partes.push(s.detalhe);
        if (s.extras.length) partes.push(s.extras.join(' · '));
        return [fmtData(s.data), s.referencia, partes.join('\n'), s.fornecedor || '—', fmtKm(s.hodometro), fmtRS(s.valor_total)];
      }),
      foot: [[{ content: 'Subtotal', colSpan: 5 }, fmtRS(v.total)]],
      columnStyles: {
        0: { cellWidth: 19 }, 1: { cellWidth: 24 }, 2: { cellWidth: 'auto' },
        3: { cellWidth: 52 }, 4: { cellWidth: 18, halign: 'right' }, 5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      },
    });
  }

  // 3) total por origem
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 9;
  if (y > alturaPag - 35) { doc.addPage(); y = 16; }
  const porOrigem = totaisPorOrigem(todos);
  autoTable(doc, {
    ...estilo,
    startY: y,
    tableWidth: 120,
    head: [['Origem', 'Serviços', 'Total']],
    body: Object.entries(porOrigem).map(([o, t]) => [ROTULO_ORIGEM[o] || o, t.n, fmtRS(t.total)]),
    foot: [['Total geral', todos.length, fmtRS(totalGeral)]],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  });

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Página ${i} de ${paginas}`, doc.internal.pageSize.getWidth() - 12, alturaPag - 6, { align: 'right' });
  }
  doc.save(`frota_manutencoes_${new Date().toISOString().slice(0, 10)}.pdf`);
}
