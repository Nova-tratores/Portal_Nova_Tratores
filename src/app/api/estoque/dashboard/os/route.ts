import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { listarOSMes, listarServicosOSMes } from '@/lib/estoque/os';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// OS faturadas do mês + itens de serviço (drill-down "vendas" do card Serviços).
// As duas listas saem do mesmo cache de ListarOS (buscarTodasOS), então a
// segunda passada não custa chamadas extra à Omie.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const mes = parseInt(sp.get('mes') || '');
  const ano = parseInt(sp.get('ano') || '');
  if (!mes || !ano) return NextResponse.json({ erro: 'Informe mes e ano' });
  try {
    const os = await listarOSMes(mes, ano, conta);
    const servicos = await listarServicosOSMes(mes, ano, conta);
    return NextResponse.json({ os, servicos, total: os.length });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
