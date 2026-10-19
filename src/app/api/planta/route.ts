// GET /api/planta?conta=NOVA|CASTRO|TODAS — números da Planta Viva (docs/planta-viva-plano.md).
// Lê só a tabela planta_kpi (gravada pelo agendador a cada 5 min). Quem não é admin recebe
// os números do financeiro e os valores em R$ LACRADOS (sem valor e sem detalhe).
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { lerSnapshot } from '@/lib/planta/server';
import { filtrarConta, prepararParaUsuario, type ContaPlanta, type LinhaKpi } from '@/lib/planta/regras';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ admin: true }, { modulo: 'planta' }]);
  if (g.resposta) return g.resposta;

  const c = String(req.nextUrl.searchParams.get('conta') || 'TODAS').toUpperCase();
  const conta: ContaPlanta = c === 'NOVA' || c === 'CASTRO' ? c : 'TODAS';
  try {
    const { linhas, migracaoFaltando } = await lerSnapshot();
    if (migracaoFaltando) return NextResponse.json({ migracaoFaltando: true, kpis: [] }, { status: 503 });
    const kpis = prepararParaUsuario(filtrarConta(linhas as LinhaKpi[], conta), g.user.isAdmin);
    const calculadoEm = linhas.map((l) => l.calculado_em).filter(Boolean).sort().pop() || null;
    return NextResponse.json({ conta, calculadoEm, admin: g.user.isAdmin, kpis }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
