import { NextRequest, NextResponse } from 'next/server';
import { negarSemDashboard } from '@/lib/estoque/dashboard-auth';
import { parseConta } from '@/lib/estoque/conta';
import { detalheCustoServicosMes } from '@/lib/estoque/custo-servicos-painel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Composição do custo de serviços de um mês (popup da barra "Custo Serviços").
// Vem do Painel Omie; custo fixo (RH) e comissão saem só como total.
export async function GET(req: NextRequest) {
  const negado = await negarSemDashboard(req);
  if (negado) return negado;
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const mes = parseInt(sp.get('mes') || '');
  const ano = parseInt(sp.get('ano') || '');
  if (!mes || !ano) return NextResponse.json({ erro: 'Informe mes e ano' }, { status: 400 });
  const detalhe = await detalheCustoServicosMes(conta, mes, ano);
  if (!detalhe) return NextResponse.json({ erro: 'Painel Omie indisponível no momento' }, { status: 503 });
  return NextResponse.json(detalhe);
}
