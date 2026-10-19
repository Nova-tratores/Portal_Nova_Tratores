import { NextRequest, NextResponse } from 'next/server';
import { listarCiclos } from '@/lib/ajustes/inventario';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'inventario' }]);
  if (g.resposta) return g.resposta;
  try {
    return NextResponse.json(await listarCiclos());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
