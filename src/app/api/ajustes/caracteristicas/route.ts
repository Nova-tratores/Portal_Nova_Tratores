import { NextRequest, NextResponse } from 'next/server';
import { lerMatrizCaracteristicas } from '@/lib/ajustes/caracteristicas';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Matriz de características (lê do Supabase produtos_caracteristicas).
export async function GET(req: NextRequest) {
  // Telas: Características e Localização física.
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'caracteristicas' }, { modulo: 'ajustes', acao: 'localizacao' }]);
  if (g.resposta) return g.resposta;
  try {
    return NextResponse.json(await lerMatrizCaracteristicas());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
