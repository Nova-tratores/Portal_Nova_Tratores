import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { obterServicosPopup } from '@/lib/estoque/os';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Drill-down "vendas" do card Serviços: OS + itens de serviço, lidos DIRETO do
// Supabase (os_servicos_itens, preenchida pelo refresh BG do os_mensal). Mês
// ainda não sincronizado volta pendente=true e o refresh é agendado.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const mes = parseInt(sp.get('mes') || '');
  const ano = parseInt(sp.get('ano') || '');
  if (!mes || !ano) return NextResponse.json({ erro: 'Informe mes e ano' });
  try {
    const r = await obterServicosPopup(mes, ano, conta);
    return NextResponse.json({ os: r.os, servicos: r.servicos, pendente: r.pendente, total: r.os.length });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
