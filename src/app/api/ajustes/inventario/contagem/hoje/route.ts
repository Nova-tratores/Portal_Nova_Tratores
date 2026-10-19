import { NextRequest, NextResponse } from 'next/server';
import { tarefasDeHoje } from '@/lib/ajustes/inventario';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Tarefas do dia para o contador (contagem cega: sem saldos).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'inventario-contagem' }]);
  if (g.resposta) return g.resposta;
  try {
    return NextResponse.json(await tarefasDeHoje());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
