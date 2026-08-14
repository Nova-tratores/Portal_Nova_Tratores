/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { supabaseFetchAll } from '@/lib/pos/supabase';
import { exigirAcessoModulo } from '@/lib/ajustes/permissao-server';
import { extrairLinhas, filtrarLinhas, type TratorRow } from '@/lib/revisoes/mahindra';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Excel das revisões 50h/900h realizadas (as que a Mahindra paga), com os
// mesmos filtros da tela /revisoes/mahindra — pronto pra enviar à fábrica
// pra cobrança. Datas viram Date nativo pra ordenar/filtrar no Excel.
export async function GET(req: NextRequest) {
  try {
    // Mesmo predicado do gate da tela (temAcesso): módulo puro, granular ou admin.
    await exigirAcessoModulo(req, 'revisoes');
  } catch (e) {
    const st = (e as { http?: number }).http || 500;
    return NextResponse.json({ error: (e as Error).message }, { status: st });
  }

  const sp = req.nextUrl.searchParams;
  const filtros = {
    tipo: sp.get('tipo') || '',
    de: sp.get('de') || '',
    ate: sp.get('ate') || '',
    q: sp.get('q') || '',
  };

  try {
    const data = await supabaseFetchAll<TratorRow>('tratores');
    const linhas = filtrarLinhas(extrairLinhas(data), filtros);
    // No Excel a ordem é cronológica (mais antiga primeiro) — a tela mostra
    // as recentes no topo, mas o documento de cobrança lê melhor em ordem.
    linhas.sort((a, b) => a.dataOrd - b.dataOrd || a.chassis.localeCompare(b.chassis));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Portal Nova Tratores';
    wb.created = new Date();
    const ws = wb.addWorksheet('Revisões 50h e 900h', {
      views: [{ state: 'frozen', ySplit: 3 }],
    });

    ws.columns = [
      { header: 'Revisão', key: 'revisao', width: 10 },
      { header: 'Data da revisão', key: 'data', width: 15 },
      { header: 'Chassi', key: 'chassis', width: 22 },
      { header: 'Modelo', key: 'modelo', width: 16 },
      { header: 'Nº Motor', key: 'motor', width: 16 },
      { header: 'Cliente', key: 'cliente', width: 36 },
      { header: 'Cidade', key: 'cidade', width: 20 },
      { header: 'Data de entrega', key: 'entrega', width: 15 },
      { header: 'Check (PDF)', key: 'pdf', width: 14 },
    ];

    // Título nas 2 primeiras linhas (o header das colunas desce pra linha 3).
    ws.spliceRows(1, 0, [], []);
    ws.mergeCells('A1:I1');
    ws.mergeCells('A2:I2');
    const t1 = ws.getCell('A1');
    t1.value = 'NOVA TRATORES — Revisões Mahindra (50h e 900h) realizadas';
    t1.font = { bold: true, size: 13, color: { argb: 'FFC41E2A' } };
    const periodo = filtros.de || filtros.ate
      ? `Período: ${filtros.de ? filtros.de.split('-').reverse().join('/') : 'início'} a ${filtros.ate ? filtros.ate.split('-').reverse().join('/') : 'hoje'}`
      : 'Período: todas as revisões registradas';
    const tot50 = linhas.filter(l => l.revisao === '50h').length;
    const tot900 = linhas.filter(l => l.revisao === '900h').length;
    const t2 = ws.getCell('A2');
    t2.value = `${periodo} · ${linhas.length} revisão(ões): ${tot50}× 50h e ${tot900}× 900h`;
    t2.font = { size: 10, color: { argb: 'FF64748B' } };

    for (const l of linhas) {
      const row = ws.addRow({
        revisao: l.revisao,
        data: l.dataOrd > 0 ? new Date(l.dataOrd) : l.data,
        chassis: l.chassis || '',
        modelo: l.modelo || '',
        motor: l.motor || '',
        cliente: l.cliente || '',
        cidade: l.cidade || '',
        entrega: l.entrega || '',
        pdf: '',
      });
      if (l.pdf) {
        row.getCell('pdf').value = { text: 'Abrir check', hyperlink: l.pdf };
        row.getCell('pdf').font = { color: { argb: 'FF0EA5E9' }, underline: true };
      }
    }

    const head = ws.getRow(3);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    head.alignment = { vertical: 'middle', wrapText: true };
    head.height = 24;

    ws.getColumn('data').numFmt = 'dd/mm/yyyy';
    ws.getColumn('revisao').alignment = { horizontal: 'center' };
    if (linhas.length) {
      ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: ws.columns.length } };
    }

    const buf = await wb.xlsx.writeBuffer();
    const nome = `revisoes-mahindra-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nome}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
