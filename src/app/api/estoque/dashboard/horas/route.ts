import { NextRequest, NextResponse } from 'next/server';
import { negarSemDashboard } from '@/lib/estoque/dashboard-auth';
import { parseConta } from '@/lib/estoque/conta';
import { obterHoras } from '@/lib/estoque/horas-dashboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Horas trabalhadas (data em que o técnico fez, relatório do app) × faturadas
// (HR das OS com NFS-e, data do faturamento), por dia e técnico.
export async function GET(req: NextRequest) {
  const negado = await negarSemDashboard(req);
  if (negado) return negado;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const incluirNC = req.nextUrl.searchParams.get('incluirNaoComercial') === '1';
  try {
    return NextResponse.json(await obterHoras(conta, incluirNC));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
