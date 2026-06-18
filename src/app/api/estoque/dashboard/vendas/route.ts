import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { listarVendas } from '@/lib/estoque/dashboard-listas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vendas detalhadas do mês (com filtro de card/categoria). Portado de
// /api/dashboard/vendas (server.js:3116).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  const mes = parseInt(sp.get('mes') || '');
  const ano = parseInt(sp.get('ano') || '');
  const card = sp.get('card') ? parseInt(sp.get('card')!) : null;
  const categoria = sp.get('categoria') || null;
  if (!mes || !ano) return NextResponse.json({ erro: 'Informe mes e ano' });
  try {
    const vendas = await listarVendas(mes, ano, card, categoria, conta);
    return NextResponse.json({ vendas, total: vendas.length });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
