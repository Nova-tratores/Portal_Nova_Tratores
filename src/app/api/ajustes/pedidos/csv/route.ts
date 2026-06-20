/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT, labelConta } from '@/lib/ajustes/conta';
import { listarPedidosEnriquecidos } from '@/lib/ajustes/pedidos';
import { resolveJanelaBR } from '@/lib/ajustes/cmc';
import { fmtISO, hoje } from '@/lib/ajustes/dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Export CSV dos pedidos abertos da janela (1 conta especifica).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const { dataDeBR, dataAteBR } = resolveJanelaBR(sp.get('de'), sp.get('ate'));
  try {
    const peds = await listarPedidosEnriquecidos(conta, dataDeBR, dataAteBR);
    const sep = ';';
    const escCSV = (v: any) => { const s = String(v == null ? '' : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ['conta', 'numero', 'dias_em_aberto', 'data_inclusao', 'data_previsao', 'criado_por', 'etapa', 'cliente', 'codigo_cliente', 'itens', 'valor_total', 'obs'].join(sep);
    const rows = peds.map((p: any) => [p.contaLabel, p.numero, p.diasAberto, p.dataInclusao, p.dataPrevisao, (p.criadoPorNome || p.criadoPorLogin || ''), p.etapaNome || p.etapa, p.nomeCliente || '', p.codigoCliente, (p.itens || []).length, (p.valorTotal || 0).toString().replace('.', ','), (p.obsVenda || '').replace(/\r?\n/g, ' ').slice(0, 200)].map(escCSV).join(sep));
    const csv = '﻿' + [head].concat(rows).join('\r\n') + '\r\n';
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pedidos-abertos-${labelConta(conta)}-${fmtISO(hoje())}.csv"`,
      },
    });
  } catch (e) {
    return new NextResponse('erro: ' + (e as Error).message, { status: 500 });
  }
}
