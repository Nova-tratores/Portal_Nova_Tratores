/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getContasOmie } from '@/lib/ajustes/conta';
import { listarPedidosAntigosTodasContas } from '@/lib/ajustes/pedidos';
import { gerarPDFPedidos } from '@/lib/ajustes/pdf-pedidos';
import { resolveJanelaBR } from '@/lib/ajustes/cmc';
import { fmtISO, hoje } from '@/lib/ajustes/dates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // pdfkit (fmt=pdf)
export const maxDuration = 300;

// Pedidos abertos ha mais de X dias, consolidado NOVA + CASTRO, agrupado por
// criador. Query: ?dias=15 (default) e ?fmt=json(default)|csv|pdf.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const diasMin = Math.max(1, parseInt(sp.get('dias') || '', 10) || 15);
  const fmt = (sp.get('fmt') || 'json').toLowerCase();
  const contas = getContasOmie().map((c) => c.id);
  const { dataDeBR, dataAteBR } = resolveJanelaBR(null, null);
  try {
    const peds = await listarPedidosAntigosTodasContas(contas, dataDeBR, dataAteBR, diasMin);

    if (fmt === 'pdf') {
      const buf = await gerarPDFPedidos({
        titulo: `Pedidos abertos ha mais de ${diasMin} dias`,
        subtitulo: 'Consolidado NOVA + CASTRO, agrupado por criador',
        pedidos: peds, agrupado: true, diasMin,
      });
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="pedidos-antigos-${diasMin}d-${fmtISO(hoje())}.pdf"`,
        },
      });
    }

    if (fmt === 'csv') {
      const sep = ';';
      const escCSV = (v: any) => { const s = String(v == null ? '' : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const head = ['criado_por', 'dias', 'conta', 'numero', 'data_inclusao', 'cliente', 'etapa', 'itens', 'valor'].join(sep);
      const rows = peds.map((p: any) => [(p.criadoPorNome || p.criadoPorLogin || ''), p.diasAberto, p.contaLabel, p.numero, p.dataInclusao, p.nomeCliente || '', p.etapaNome || p.etapa, (p.itens || []).length, (p.valorTotal || 0).toString().replace('.', ',')].map(escCSV).join(sep));
      const csv = '﻿' + [head].concat(rows).join('\r\n') + '\r\n';
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="pedidos-antigos-${diasMin}d-${fmtISO(hoje())}.csv"`,
        },
      });
    }

    return NextResponse.json({ diasMin, total: peds.length, pedidos: peds });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
