import { NextRequest, NextResponse } from 'next/server';
import { lerStatusVerificacao } from '@/lib/ajustes/verificacao';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Status da verificacao diaria (le o job no Supabase).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'alertas' }]);
  if (g.resposta) return g.resposta;
  try {
    return NextResponse.json(await lerStatusVerificacao());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
