import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { listarVendas } from '@/lib/estoque/dashboard-listas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vendas detalhadas do mês (com filtro de card/categoria). `modo=ano` (ou
// mes=0) lista o ano inteiro. Portado de /api/dashboard/vendas (server.js:3116).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  const mesParam = parseInt(sp.get('mes') || '');
  const ano = parseInt(sp.get('ano') || '');
  const ehAno = sp.get('modo') === 'ano' || mesParam === 0;
  const mes = ehAno ? null : mesParam;
  const catKey = sp.get('catKey') || null;
  const categoria = sp.get('categoria') || null;
  const familiaMaquina = sp.get('familiaMaquina') || null;
  if (!ano || (!ehAno && !mes)) return NextResponse.json({ erro: 'Informe mes e ano' });
  try {
    const vendas = await listarVendas(mes, ano, catKey, categoria, conta, familiaMaquina);
    return NextResponse.json({ vendas, total: vendas.length });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
