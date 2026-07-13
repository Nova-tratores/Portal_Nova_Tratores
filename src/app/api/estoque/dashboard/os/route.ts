import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { listarOSMes } from '@/lib/estoque/os';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// OS faturadas do mês (drill-down "vendas" do card Serviços do dashboard).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const mes = parseInt(sp.get('mes') || '');
  const ano = parseInt(sp.get('ano') || '');
  if (!mes || !ano) return NextResponse.json({ erro: 'Informe mes e ano' });
  try {
    const os = await listarOSMes(mes, ano, conta);
    return NextResponse.json({ os, total: os.length });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
