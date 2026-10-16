import { NextRequest, NextResponse } from 'next/server';
import { acessoDashboard } from '@/lib/estoque/dashboard-auth';
import { parseConta } from '@/lib/estoque/conta';
import { montarTendencia } from '@/lib/estoque/dashboard-listas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Tendência dos últimos 12 meses: faturamento de Peças, Serviços e Máquinas por
// mês (respeita a conta). Lê só o banco.
export async function GET(req: NextRequest) {
  const { negado, maquinas } = await acessoDashboard(req);
  if (negado) return negado;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  try {
    const { pontos, comparativos } = await montarTendencia(conta);
    // Sem estoque:dashboard-maquinas o faturamento de máquinas sai zerado.
    const ps = maquinas ? pontos : pontos.map((p) => ({ ...p, maquinas: 0, maquinasUn: 0 }));
    return NextResponse.json({ pontos: ps, comparativos });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
