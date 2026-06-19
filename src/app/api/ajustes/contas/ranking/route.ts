import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { rankingContas } from '@/lib/ajustes/contas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Ranking de contas a pagar/receber por categoria ou departamento.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tipo = sp.get('tipo') === 'receber' ? 'receber' : 'pagar';
  const dim = sp.get('dim') === 'departamento' ? 'departamento' : 'categoria';
  const conta = parseConta(sp.get('conta'));
  try {
    const out = await rankingContas(tipo, dim, conta, sp.get('de'), sp.get('ate'));
    return NextResponse.json({ ...out, conta: conta ?? 'todas' });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
