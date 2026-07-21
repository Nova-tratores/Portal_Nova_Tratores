/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { parseConta, CONTA_DEFAULT, labelConta } from '@/lib/ajustes/conta';
import { listarPedidosEnriquecidos } from '@/lib/ajustes/pedidos';
import { resolveJanelaBR } from '@/lib/ajustes/cmc';
import { fmtISO, hoje, parseAnyDate } from '@/lib/ajustes/dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Export XLSX dos pedidos abertos da janela (1 conta especifica). Mesmas colunas
// do /csv, mas com tipos nativos (data = data, valor = moeda) pra ordenar e
// somar direto no Excel — o CSV manda tudo como texto.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const { dataDeBR, dataAteBR } = resolveJanelaBR(sp.get('de'), sp.get('ate'));
  try {
    const peds = await listarPedidosEnriquecidos(conta, dataDeBR, dataAteBR);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Portal Nova Tratores';
    wb.created = new Date();
    const ws = wb.addWorksheet('Pedidos abertos', {
      views: [{ state: 'frozen', ySplit: 1 }], // cabecalho fixo ao rolar
    });

    ws.columns = [
      { header: 'Conta', key: 'conta', width: 10 },
      { header: 'Numero', key: 'numero', width: 12 },
      { header: 'Dias em aberto', key: 'diasAberto', width: 14 },
      { header: 'Dias parado na etapa', key: 'diasParado', width: 19 },
      { header: 'Data inclusao', key: 'dataInclusao', width: 14 },
      { header: 'Data previsao', key: 'dataPrevisao', width: 14 },
      { header: 'Criado por', key: 'criadoPor', width: 24 },
      { header: 'Alterado por', key: 'alteradoPor', width: 24 },
      { header: 'Etapa', key: 'etapa', width: 22 },
      { header: 'Cliente', key: 'cliente', width: 38 },
      { header: 'Codigo cliente', key: 'codigoCliente', width: 14 },
      { header: 'Itens', key: 'itens', width: 8 },
      { header: 'Valor total', key: 'valorTotal', width: 15 },
      { header: 'Observacao', key: 'obs', width: 60 },
    ];

    for (const p of peds as any[]) {
      ws.addRow({
        conta: p.contaLabel,
        numero: p.numero || '',
        diasAberto: p.diasAberto ?? null,
        diasParado: p.diasParadoEtapa ?? null,
        dataInclusao: parseAnyDate(p.dataInclusao),
        dataPrevisao: parseAnyDate(p.dataPrevisao),
        criadoPor: p.criadoPorNome || p.criadoPorLogin || '',
        alteradoPor: p.alteradoPorNome || p.alteradoPorLogin || '',
        etapa: p.etapaNome || p.etapa || '',
        cliente: p.nomeCliente || '',
        codigoCliente: p.codigoCliente ?? null,
        itens: (p.itens || []).length,
        valorTotal: Number(p.valorTotal || 0),
        obs: (p.obsVenda || '').replace(/\r?\n/g, ' ').slice(0, 500),
      });
    }

    // Cabecalho em negrito sobre fundo escuro (mesma paleta da tela).
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    head.alignment = { vertical: 'middle', wrapText: true };
    head.height = 26;

    ws.getColumn('dataInclusao').numFmt = 'dd/mm/yyyy';
    ws.getColumn('dataPrevisao').numFmt = 'dd/mm/yyyy';
    ws.getColumn('valorTotal').numFmt = 'R$ #,##0.00';
    for (const k of ['diasAberto', 'diasParado', 'itens', 'codigoCliente']) {
      ws.getColumn(k).alignment = { horizontal: 'right' };
    }
    if (peds.length) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
    }

    const buf = await wb.xlsx.writeBuffer();
    const nome = `pedidos-abertos-${labelConta(conta)}-${fmtISO(hoje())}.xlsx`;
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nome}"`,
      },
    });
  } catch (e) {
    return new NextResponse('erro: ' + (e as Error).message, { status: 500 });
  }
}
