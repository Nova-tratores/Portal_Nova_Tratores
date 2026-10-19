import { NextRequest, NextResponse } from 'next/server';
import { lerStatusSync } from '@/lib/ajustes/caracteristicas';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'caracteristicas' }]);
  if (g.resposta) return g.resposta;
  try {
    return NextResponse.json(await lerStatusSync());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
