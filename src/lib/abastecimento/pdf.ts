// Relatórios PDF do módulo Abastecimento (gerados no cliente com jspdf +
// jspdf-autotable, mesmo padrão de src/lib/financeiro/export.js).
//
// Três relatórios, todos respeitando o período/filtros da tela:
//  - Todos os abastecimentos (analítico)
//  - Consolidado por veículo
//  - Consolidado por motorista

import type { RankingItem, TransacaoRow } from './tipos';

const VERMELHO: [number, number, number] = [220, 38, 38]; // #dc2626 (identidade)

function fmtRS(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtL(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}
function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
function fmtDataBR(isoDia: string): string {
  const [a, m, d] = isoDia.split('-');
  return `${d}/${m}/${a}`;
}

interface CabecalhoOpts {
  titulo: string;
  periodo: { de: string; ate: string };
  filtros?: string[]; // descrições extras (filial, veículo...)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function novoDoc(orientacao: 'portrait' | 'landscape', cab: CabecalhoOpts): Promise<{ doc: any; autoTable: any; startY: number }> {
  const { default: JsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new JsPDF({ orientation: orientacao, unit: 'mm', format: 'a4' });

  doc.setFontSize(14);
  doc.setTextColor(...VERMELHO);
  doc.setFont('helvetica', 'bold');
  doc.text('Nova Tratores — Abastecimento da Frota', 14, 16);

  doc.setFontSize(11);
  doc.setTextColor(40);
  doc.text(cab.titulo, 14, 23);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(110);
  const linhasInfo = [
    `Período: ${fmtDataBR(cab.periodo.de)} a ${fmtDataBR(cab.periodo.ate)}`,
    ...(cab.filtros || []),
    `Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  ];
  linhasInfo.forEach((t, i) => doc.text(t, 14, 28.5 + i * 4));

  return { doc, autoTable, startY: 28.5 + linhasInfo.length * 4 + 2 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rodapePaginas(doc: any) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Página ${i} de ${total}`, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
  }
}

const ESTILO_TABELA = {
  styles: { fontSize: 7.5, cellPadding: 1.6 },
  headStyles: { fillColor: VERMELHO, textColor: 255, fontStyle: 'bold' as const },
  alternateRowStyles: { fillColor: [250, 250, 250] as [number, number, number] },
};

export async function gerarPdfTransacoes(opts: {
  periodo: { de: string; ate: string };
  filtros?: string[];
  linhas: TransacaoRow[];
  somaValor: number;
  somaLitros: number;
}) {
  const { doc, autoTable, startY } = await novoDoc('landscape', {
    titulo: 'Relatório de Abastecimentos (analítico)',
    periodo: opts.periodo,
    filtros: opts.filtros,
  });

  autoTable(doc, {
    ...ESTILO_TABELA,
    startY,
    head: [['Data/Hora', 'Placa', 'Modelo', 'Motorista', 'Posto', 'Combustível', 'Litros', 'R$/L', 'Total', 'Hodômetro', 'OS']],
    body: opts.linhas.map((l) => [
      fmtDataHora(l.data_transacao),
      l.placa,
      l.modelo_veiculo || '—',
      l.motorista_nome || 'Sem motorista',
      l.posto_nome || '—',
      l.combustivel || '—',
      fmtL(l.litros),
      l.valor_unitario != null ? l.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—',
      fmtRS(l.valor_total),
      l.hodometro != null ? l.hodometro.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—',
      l.ordem_servico || '—',
    ]),
    foot: [[
      { content: `${opts.linhas.length} abastecimento(s)`, colSpan: 6 },
      fmtL(opts.somaLitros), '', fmtRS(opts.somaValor), '', '',
    ]],
    footStyles: { fillColor: [245, 245, 245] as [number, number, number], textColor: 40, fontStyle: 'bold' as const },
    columnStyles: { 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
  });

  rodapePaginas(doc);
  doc.save(`abastecimentos_${opts.periodo.de}_a_${opts.periodo.ate}.pdf`);
}

export async function gerarPdfConsolidado(opts: {
  tipo: 'veiculo' | 'motorista';
  periodo: { de: string; ate: string };
  filtros?: string[];
  itens: RankingItem[];
}) {
  const porVeiculo = opts.tipo === 'veiculo';
  const { doc, autoTable, startY } = await novoDoc('portrait', {
    titulo: `Relatório consolidado por ${porVeiculo ? 'veículo' : 'motorista'}`,
    periodo: opts.periodo,
    filtros: opts.filtros,
  });

  const somaValor = opts.itens.reduce((s, i) => s + i.valor, 0);
  const somaLitros = opts.itens.reduce((s, i) => s + i.litros, 0);

  autoTable(doc, {
    ...ESTILO_TABELA,
    startY,
    head: [[
      porVeiculo ? 'Placa' : 'Motorista',
      porVeiculo ? 'Modelo' : '',
      'Abastecimentos', 'Litros', 'Preço médio/L', 'Total (R$)', '% do total',
    ].filter((h, i) => porVeiculo || i !== 1)],
    body: opts.itens.map((i) => {
      const linha = [
        i.chave,
        ...(porVeiculo ? [i.detalhe || '—'] : []),
        String(i.transacoes),
        fmtL(i.litros),
        i.litros > 0 ? fmtRS(i.valor / i.litros) : '—',
        fmtRS(i.valor),
        somaValor > 0 ? ((i.valor / somaValor) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—',
      ];
      return linha;
    }),
    foot: [[
      { content: `${opts.itens.length} ${porVeiculo ? 'veículo(s)' : 'motorista(s)'}`, colSpan: porVeiculo ? 3 : 2 },
      fmtL(somaLitros),
      somaLitros > 0 ? fmtRS(somaValor / somaLitros) : '—',
      fmtRS(somaValor),
      '100%',
    ]],
    footStyles: { fillColor: [245, 245, 245] as [number, number, number], textColor: 40, fontStyle: 'bold' as const },
    columnStyles: porVeiculo
      ? { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } }
      : { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  });

  rodapePaginas(doc);
  doc.save(`abastecimento_por_${opts.tipo}_${opts.periodo.de}_a_${opts.periodo.ate}.pdf`);
}
