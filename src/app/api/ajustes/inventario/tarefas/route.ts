import { NextRequest, NextResponse } from 'next/server';
import { listarTarefas } from '@/lib/ajustes/inventario';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Lista tarefas (global). NÃO retorna saldos (contagem cega).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'inventario' }]);
  if (g.resposta) return g.resposta;
  const sp = req.nextUrl.searchParams;
  try {
    return NextResponse.json(await listarTarefas({ ciclo: sp.get('ciclo') || undefined, status: sp.get('status') || undefined }));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
