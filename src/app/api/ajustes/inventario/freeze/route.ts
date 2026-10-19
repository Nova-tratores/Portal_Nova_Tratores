/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { freezeCiclo } from '@/lib/ajustes/inventario';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Re-dispara o freeze das tarefas pendentes de um ciclo.
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'inventario' }]);
  if (g.resposta) return g.resposta;
  try {
    const cicloId = parseInt(String(((await req.json().catch(() => ({}))) as any).cicloId), 10);
    if (!Number.isInteger(cicloId)) return NextResponse.json({ ok: false, erro: 'informe cicloId' }, { status: 400 });
    const r = await freezeCiclo(cicloId, { onProgress: (m: string) => console.log(`[inventario freeze ${cicloId}] ${m}`) });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
