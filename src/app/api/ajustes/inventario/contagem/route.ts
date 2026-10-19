import { NextRequest, NextResponse } from 'next/server';
import { registrarContagem } from '@/lib/ajustes/inventario';
import type { HttpError } from '@/lib/ajustes/cmc';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Registra a contagem cega de uma tarefa. Retorna só o status (sem saldo/divergência).
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'inventario-contagem' }]);
  if (g.resposta) return g.resposta;
  try {
    const b = (await req.json().catch(() => ({}))) as { tarefaId?: number | string; qtd?: number | string; contadoPor?: string };
    const tarefaId = parseInt(String(b.tarefaId), 10);
    if (!Number.isInteger(tarefaId)) return NextResponse.json({ ok: false, erro: 'informe tarefaId' }, { status: 400 });
    // Autoria do login. O campo "quem esta contando" da tela (aparelho compartilhado)
    // segue como rótulo, ancorado em quem está logado.
    const autor = autorDe(g.user);
    const declarado = (b.contadoPor || '').trim();
    const contadoPor = declarado && declarado !== autor ? `${declarado} (por ${autor})` : autor;
    const r = await registrarContagem(tarefaId, b.qtd, { contadoPor });
    return NextResponse.json(r);
  } catch (e) {
    const err = e as HttpError;
    return NextResponse.json({ ok: false, erro: err.message }, { status: err.http || 500 });
  }
}
