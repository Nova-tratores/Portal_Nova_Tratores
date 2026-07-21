import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { montarDashboard } from '@/lib/estoque/dashboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Dashboard de vendas: cards por categoria com comparativo mês/ano e projeção.
// `modo=ano` (ou mes=0) agrega o ano inteiro em vez de um mês.
// Portado de /api/dashboard (server.js:1395).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  const now = new Date();
  const mesParam = sp.get('mes') ? parseInt(sp.get('mes')!) : now.getMonth() + 1;
  const modo = sp.get('modo') === 'ano' || mesParam === 0 ? 'ano' : 'mes';
  const selMes = modo === 'ano' ? 0 : mesParam;
  const selAno = sp.get('ano') ? parseInt(sp.get('ano')!) : now.getFullYear();
  const filtroCategoria = sp.get('categoria') || null;

  try {
    const dados = await montarDashboard(selMes, selAno, filtroCategoria, conta, modo);
    return NextResponse.json(dados);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
