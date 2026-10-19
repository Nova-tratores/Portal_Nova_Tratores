import { NextRequest, NextResponse } from 'next/server';
import { catalogoCaracteristicas } from '@/lib/ajustes/caracteristicas';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Catálogo da Omie: valores permitidos por característica (união + por empresa).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'caracteristicas' }]);
  if (g.resposta) return g.resposta;
  try {
    return NextResponse.json(await catalogoCaracteristicas());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}
