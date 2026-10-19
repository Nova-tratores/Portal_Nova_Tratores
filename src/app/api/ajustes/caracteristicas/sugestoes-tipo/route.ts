import { NextRequest, NextResponse } from 'next/server';
import { sugestoesTipo } from '@/lib/ajustes/caracteristicas';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Sugere "Tipo:" para produtos com esse campo vazio (casamento da descrição).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'caracteristicas' }]);
  if (g.resposta) return g.resposta;
  try {
    return NextResponse.json(await sugestoesTipo());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
