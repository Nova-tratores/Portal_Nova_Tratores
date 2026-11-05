import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { calcularGiroEstoque } from '@/lib/estoque/giro';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Giro de estoque. Portado de /api/giro-estoque (server.js:3724).
export async function GET(req: NextRequest) {
  // Mesma regra da tela /estoque/giro-estoque: pode('estoque', 'giro-estoque').
  const g = await protegerRota(req, [{ modulo: 'estoque', acao: 'giro-estoque' }]);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  const periodo = parseInt(sp.get('periodo') || '') || 12;
  const filtroFamilia = (sp.get('familia') || '').trim();
  try {
    const r = await calcularGiroEstoque(periodo, filtroFamilia, conta);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
