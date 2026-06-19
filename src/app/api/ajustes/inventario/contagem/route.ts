import { NextRequest, NextResponse } from 'next/server';
import { registrarContagem } from '@/lib/ajustes/inventario';
import type { HttpError } from '@/lib/ajustes/cmc';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Registra a contagem cega de uma tarefa. Retorna só o status (sem saldo/divergência).
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => ({}))) as { tarefaId?: number | string; qtd?: number | string; contadoPor?: string };
    const tarefaId = parseInt(String(b.tarefaId), 10);
    if (!Number.isInteger(tarefaId)) return NextResponse.json({ ok: false, erro: 'informe tarefaId' }, { status: 400 });
    const r = await registrarContagem(tarefaId, b.qtd, { contadoPor: b.contadoPor || 'app-contagem' });
    return NextResponse.json(r);
  } catch (e) {
    const err = e as HttpError;
    return NextResponse.json({ ok: false, erro: err.message }, { status: err.http || 500 });
  }
}
