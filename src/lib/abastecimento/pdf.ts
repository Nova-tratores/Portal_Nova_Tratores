// Relatórios PDF do módulo Abastecimento (gerados no cliente com jspdf +
// jspdf-autotable, mesmo padrão de src/lib/financeiro/export.js).
//
// Quatro relatórios, todos respeitando o período/filtros da tela:
//  - Todos os abastecimentos (analítico)
//  - Consolidado por veículo
//  - Consolidado por motorista
//  - Por departamento (estilo da tabela dinâmica do Excel: Departamento →
//    Placa → Motorista, subtotais, resumo Cartão × Requisição, total por motorista)

import type { RankingItem, TransacaoRow } from './tipos';
import { agruparPorDepartamento } from './departamento';

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
// requisição só tem a DATA (sem hora real da bomba)
function fmtDataLinha(l: TransacaoRow): string {
  return l.origem === 'requisicao'
    ? new Date(l.data_transacao).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' })
    : fmtDataHora(l.data_transacao);
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
  somaEconomia?: number; // desconto da operadora no recorte
}) {
  const { doc, autoTable, startY } = await novoDoc('landscape', {
    titulo: 'Relatório de Abastecimentos (analítico)',
    periodo: opts.periodo,
    filtros: opts.filtros,
  });

  autoTable(doc, {
    ...ESTILO_TABELA,
    startY,
    head: [['Data/Hora', 'Origem', 'Placa', 'Modelo', 'Motorista', 'Posto', 'Combustível', 'Litros', 'R$/L', 'Total pago', 'Economia', 'Hodômetro', 'OS']],
    body: opts.linhas.map((l) => [
      fmtDataLinha(l),
      l.origem === 'requisicao' ? `Req #${l.req_id}` : 'Cartão',
      l.placa,
      l.modelo_veiculo || '—',
      l.motorista_nome || 'Sem motorista',
      l.posto_nome || '—',
      l.combustivel || '—',
      fmtL(l.litros),
      l.valor_unitario != null ? l.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—',
      fmtRS(l.valor_total),
      l.valor_economizado ? fmtRS(l.valor_economizado) : '—',
      l.hodometro != null ? l.hodometro.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—',
      l.ordem_servico || '—',
    ]),
    foot: [[
      { content: `${opts.linhas.length} abastecimento(s)`, colSpan: 7 },
      fmtL(opts.somaLitros), '', fmtRS(opts.somaValor),
      opts.somaEconomia ? fmtRS(opts.somaEconomia) : '—', '', '',
    ]],
    footStyles: { fillColor: [245, 245, 245] as [number, number, number], textColor: 40, fontStyle: 'bold' as const },
    columnStyles: { 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' }, 11: { halign: 'right' } },
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

// ---------------------------------------------------------------------------
// Por departamento — reproduz o PDF que o usuário montava no Excel (tabela
// dinâmica): paisagem, cabeçalho azul-marinho, tabela principal à esquerda
// (Departamento | Placa | Motorista | Data | Forma | Valor) e, à direita,
// "Resumo — total por departamento" (só quando sem filtro de departamento) e
// "Total por motorista". Subtotais: filtrado em 1 departamento → por PLACA;
// todos os departamentos → por DEPARTAMENTO (igual aos arquivos do Excel).
// ---------------------------------------------------------------------------

const NAVY: [number, number, number] = [31, 56, 100];
const AZUL_SUBTOTAL: [number, number, number] = [221, 235, 247];
const CINZA_TOTAL: [number, number, number] = [230, 230, 230];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Celula = string | { content: string; colSpan?: number; styles?: any };

function fmtSoData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function linhaSubtotal(rotulo: string, valor: number, colSpan: number): Celula[] {
  const st = { fillColor: AZUL_SUBTOTAL, fontStyle: 'bold' as const, textColor: 20 };
  return [
    { content: rotulo, colSpan, styles: st },
    { content: fmtRS(valor), styles: { ...st, halign: 'right' } },
  ];
}

export async function gerarPdfPorDepartamento(opts: {
  periodo: { de: string; ate: string };
  filtros?: string[];
  departamento?: string; // '' / undefined = todos os departamentos
  linhas: TransacaoRow[];
}) {
  const todos = !opts.departamento;
  const rel = agruparPorDepartamento(opts.linhas);

  const { doc, autoTable, startY } = await novoDoc('landscape', {
    titulo: `Abastecimento por departamento — ${todos ? 'Todos os departamentos' : String(opts.departamento).toUpperCase()}`,
    periodo: opts.periodo,
    filtros: opts.filtros,
  });

  // geometria (A4 paisagem = 297 mm; margens de 14)
  const LARG_PAG = doc.internal.pageSize.getWidth() as number;
  const X0 = 14;
  const W_MAIN = 160;
  const GAP = 6;
  const X_SIDE = X0 + W_MAIN + GAP;
  const W_SIDE = LARG_PAG - X0 - X_SIDE;

  const base = {
    theme: 'grid' as const,
    styles: { fontSize: 7, cellPadding: 1.2, lineColor: [200, 200, 200] as [number, number, number], lineWidth: 0.1, textColor: 20 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' as const },
    footStyles: { fillColor: CINZA_TOTAL, textColor: 20, fontStyle: 'bold' as const },
    showHead: 'everyPage' as const,
    showFoot: 'lastPage' as const,
    rowPageBreak: 'avoid' as const,
  };

  // ---- tabela principal ----
  const corpo: Celula[][] = [];
  for (const d of rel.departamentos) {
    let primeiraDoDepto = true;
    for (const p of d.placas) {
      let primeiraDaPlaca = true;
      for (const m of p.motoristas) {
        let primeiraDoMotorista = true;
        for (const l of m.linhas) {
          corpo.push([
            primeiraDoDepto ? d.departamento.toUpperCase() : '',
            primeiraDaPlaca ? p.placa : '',
            primeiraDoMotorista ? m.motorista : '',
            fmtSoData(l.data),
            l.forma,
            { content: fmtRS(l.valor), styles: { halign: 'right' } },
          ]);
          primeiraDoDepto = false;
          primeiraDaPlaca = false;
          primeiraDoMotorista = false;
        }
      }
      if (!todos) corpo.push(linhaSubtotal(`${p.placa} Total`, p.total, 5));
    }
    if (todos) corpo.push(linhaSubtotal(`${d.departamento.toUpperCase()} Total`, d.total, 5));
  }
  if (!corpo.length) corpo.push([{ content: 'Sem abastecimentos no período', colSpan: 6, styles: { halign: 'center', textColor: 120 } }]);

  autoTable(doc, {
    ...base,
    startY,
    margin: { left: X0, right: LARG_PAG - X0 - W_MAIN },
    tableWidth: W_MAIN,
    head: [['Departamento', 'Placa', 'Motorista', 'Data Abast.', 'Forma', 'Soma de Valor (R$)']],
    body: corpo,
    foot: [[{ content: 'Total geral', colSpan: 5 }, { content: fmtRS(rel.totalGeral), styles: { halign: 'right' } }]],
    columnStyles: {
      0: { cellWidth: 34 }, 1: { cellWidth: 20 }, 2: { cellWidth: 52 },
      3: { cellWidth: 20 }, 4: { cellWidth: 16 }, 5: { cellWidth: 18, halign: 'right' },
    },
  });

  // ---- tabelas laterais (voltam pra página 1, mesma altura do topo) ----
  // autotable v5 reaproveita páginas existentes ao quebrar, então a lateral
  // continua na banda direita da página 2 sem invadir a principal.
  doc.setPage(1);
  let y = startY;
  const margemLateral = { left: X_SIDE, right: X0 };

  if (todos) {
    autoTable(doc, {
      ...base,
      startY: y,
      margin: margemLateral,
      tableWidth: W_SIDE,
      head: [
        [{ content: 'RESUMO — TOTAL POR DEPARTAMENTO', colSpan: 4, styles: { halign: 'left' } }],
        ['Departamento', 'Cartão', 'Requisição', 'Total geral'],
      ],
      body: rel.departamentos.map((d) => [
        d.departamento.toUpperCase(),
        { content: fmtRS(d.cartao), styles: { halign: 'right' } },
        { content: fmtRS(d.requisicao), styles: { halign: 'right' } },
        { content: fmtRS(d.total), styles: { halign: 'right', fontStyle: 'bold' } },
      ]),
      foot: [[
        'Total geral',
        { content: fmtRS(rel.totalCartao), styles: { halign: 'right' } },
        { content: fmtRS(rel.totalRequisicao), styles: { halign: 'right' } },
        { content: fmtRS(rel.totalGeral), styles: { halign: 'right' } },
      ]],
      columnStyles: { 0: { cellWidth: W_SIDE - 63 }, 1: { cellWidth: 21, halign: 'right' }, 2: { cellWidth: 21, halign: 'right' }, 3: { cellWidth: 21, halign: 'right' } },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 6;
  }

  const corpoMot: Celula[][] = [];
  for (const d of rel.porMotorista) {
    let primeira = true;
    for (const m of d.motoristas) {
      corpoMot.push([
        primeira ? d.departamento.toUpperCase() : '',
        m.motorista,
        { content: fmtRS(m.total), styles: { halign: 'right' } },
      ]);
      primeira = false;
    }
    if (todos) corpoMot.push(linhaSubtotal(`${d.departamento.toUpperCase()} Total`, d.total, 2));
  }
  if (!corpoMot.length) corpoMot.push([{ content: '—', colSpan: 3, styles: { halign: 'center', textColor: 120 } }]);

  autoTable(doc, {
    ...base,
    startY: y,
    margin: margemLateral,
    tableWidth: W_SIDE,
    head: [
      [{ content: 'TOTAL POR MOTORISTA', colSpan: 3, styles: { halign: 'left' } }],
      ['Departamento', 'Motorista', 'Soma de Valor (R$)'],
    ],
    body: corpoMot,
    foot: [[{ content: 'Total geral', colSpan: 2 }, { content: fmtRS(rel.totalGeral), styles: { halign: 'right' } }]],
    columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: W_SIDE - 30 - 24 }, 2: { cellWidth: 24, halign: 'right' } },
  });

  rodapePaginas(doc);
  const slug = todos
    ? 'todos'
    : String(opts.departamento).normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w]+/g, '_').toLowerCase();
  doc.save(`abastecimento_por_departamento_${slug}_${opts.periodo.de}_a_${opts.periodo.ate}.pdf`);
}
