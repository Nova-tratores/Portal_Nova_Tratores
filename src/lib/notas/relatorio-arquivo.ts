// Gera o ARQUIVO do relatório de notas no navegador (Excel, CSV ou PDF) a partir da
// tabela que o servidor montou (rota /api/financeiro/notas/relatorio, que já registrou
// a exportação no log). Só roda no navegador: xlsx/jspdf entram por import dinâmico.
import { fmtCelula, relatorioCsv, type FormatoRelatorio, type Relatorio } from './filtros-relatorios';

export interface MetaRelatorio { filtros: string[]; geradoPor: string; geradoEm: string; notas: number }

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function nomeArquivo(r: Relatorio, ext: string): string {
  const base = r.titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const d = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  return `notas-${base}-${d}.${ext}`;
}

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export async function gerarArquivoRelatorio(r: Relatorio, meta: MetaRelatorio, formato: FormatoRelatorio): Promise<void> {
  if (formato === 'csv') {
    baixar(new Blob(['﻿' + relatorioCsv(r)], { type: 'text/csv;charset=utf-8' }), nomeArquivo(r, 'csv'));
    return;
  }
  if (formato === 'xlsx') {
    const XLSX = await import('xlsx');
    const topo: (string | number)[][] = [
      [`Nova Tratores — ${r.titulo}`],
      ...meta.filtros.map((f) => [f]),
      [`Gerado por ${meta.geradoPor} em ${quando(meta.geradoEm)} · ${meta.notas} nota(s)`],
      ...(r.observacao ? [[r.observacao]] : []),
      [],
    ];
    const cab = r.colunas.map((c) => c.rotulo);
    const valor = (v: unknown, tipo: string) => {
      if (v == null || v === '') return '';
      if (tipo === 'moeda' || tipo === 'numero' || tipo === 'pct') return Number(v);
      if (tipo === 'data') return fmtCelula(v as string, 'data');
      return String(v);
    };
    const corpo = r.linhas.map((l) => r.colunas.map((c) => valor(l[c.id], c.tipo)));
    const total = r.total ? [r.colunas.map((c) => valor(r.total![c.id], c.tipo))] : [];
    const ws = XLSX.utils.aoa_to_sheet([...topo, cab, ...corpo, ...total]);
    const linhaIni = topo.length + 1; // 1ª linha de dados (0-based = topo.length + 1)
    r.colunas.forEach((c, j) => {
      const z = c.tipo === 'moeda' ? '"R$" #,##0.00' : c.tipo === 'pct' ? '0.0%' : c.tipo === 'numero' ? '#,##0' : null;
      if (!z) return;
      for (let i = linhaIni; i < linhaIni + corpo.length + total.length; i++) {
        const cell = ws[XLSX.utils.encode_cell({ r: i, c: j })];
        if (cell && typeof cell.v === 'number') cell.z = z;
      }
    });
    ws['!cols'] = r.colunas.map((c) => ({ wch: c.tipo === 'texto' ? Math.min(45, Math.max(12, c.rotulo.length + 4)) : 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, r.titulo.slice(0, 31));
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nomeArquivo(r, 'xlsx'));
    return;
  }
  // PDF
  const { default: JsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new JsPDF({ orientation: r.colunas.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(21, 128, 61);
  doc.text(`Nova Tratores — ${r.titulo}`, 14, 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
  const info = [...meta.filtros, `Gerado por ${meta.geradoPor} em ${quando(meta.geradoEm)} · ${meta.notas} nota(s)`, ...(r.observacao ? [r.observacao] : [])];
  info.forEach((t, i) => doc.text(t, 14, 21 + i * 4));
  const alinhaDir = r.colunas.reduce<Record<number, { halign: 'right' }>>((acc, c, j) => {
    if (c.tipo !== 'texto' && c.tipo !== 'data') acc[j] = { halign: 'right' };
    return acc;
  }, {});
  autoTable(doc, {
    startY: 21 + info.length * 4 + 2,
    head: [r.colunas.map((c) => c.rotulo)],
    body: r.linhas.map((l) => r.colunas.map((c) => fmtCelula(l[c.id] ?? null, c.tipo))),
    foot: r.total ? [r.colunas.map((c) => fmtCelula(r.total![c.id] ?? null, c.tipo))] : undefined,
    styles: { fontSize: r.colunas.length > 9 ? 6.5 : 8, cellPadding: 1.4, overflow: 'linebreak' },
    headStyles: { fillColor: [21, 128, 61], textColor: 255 },
    footStyles: { fillColor: [236, 253, 245], textColor: 20, fontStyle: 'bold' },
    columnStyles: alinhaDir,
    showFoot: 'lastPage',
  });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(140);
    doc.text(`Página ${i} de ${n}`, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 7, { align: 'right' });
  }
  doc.save(nomeArquivo(r, 'pdf'));
}
