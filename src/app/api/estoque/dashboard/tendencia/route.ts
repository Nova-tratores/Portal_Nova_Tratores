import { NextRequest, NextResponse } from 'next/server';
import { negarSemDashboard } from '@/lib/estoque/dashboard-auth';
import { parseConta } from '@/lib/estoque/conta';
import { montarTendencia } from '@/lib/estoque/dashboard-listas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Tendência dos últimos 12 meses: faturamento de Peças, Serviços e Máquinas por
// mês (respeita a conta). Lê só o banco.
export async function GET(req: NextRequest) {
  const negado = await negarSemDashboard(req);
  if (negado) return negado;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  try {
    const { pontos, comparativos } = await montarTendencia(conta);
    return NextResponse.json({ pontos, comparativos });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
