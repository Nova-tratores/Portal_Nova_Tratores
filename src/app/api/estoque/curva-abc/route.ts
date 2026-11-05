import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { calcularCurvaABC, type CurvaTipo } from '@/lib/estoque/curva-abc';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Curva ABC (Pareto). Portado de /api/curva-abc (server.js:3353).
export async function GET(req: NextRequest) {
  // Mesma regra da tela /estoque/curva-abc: pode('estoque', 'curva-abc').
  const g = await protegerRota(req, [{ modulo: 'estoque', acao: 'curva-abc' }]);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  const tipo = (sp.get('tipo') || 'produto') as CurvaTipo;
  const periodo = parseInt(sp.get('periodo') || '') || 12;
  const tipoCaract = (sp.get('tipo_caract') || '').trim();
  const filtroFamilia = (sp.get('familia') || '').trim();
  try {
    const r = await calcularCurvaABC(tipo, periodo, tipoCaract, filtroFamilia, conta);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
