import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';
import { iniciarDevolucaoLote } from '@/lib/ajustes/remessas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // so inicia o job; o trabalho roda em background

// Inicia a devolucao integral em lote das remessas informadas (job em
// background 'remessas-devolver'; acompanhar via GET /devolver-status).
// Body: { conta: 'NOVA'|'CASTRO', ids: number[] }.
export async function POST(req: NextRequest) {
  try {
    const user = await exigirPermissao(req, 'ajustes', 'remessas:fechar');
    const body = (await req.json().catch(() => ({}))) as { conta?: string; ids?: number[] };
    const conta = parseConta(body.conta ?? null) ?? CONTA_DEFAULT;
    const ids = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length === 0) {
      return NextResponse.json({ ok: false, erro: 'nenhuma remessa selecionada' }, { status: 400 });
    }
    const r = await iniciarDevolucaoLote(conta, {
      ids,
      criadoPor: user.nome || user.email || user.id,
      userId: user.id,
    });
    return NextResponse.json(r, { status: 202 });
  } catch (e) {
    const err = e as { http?: number; faultstring?: string };
    return NextResponse.json({ ok: false, erro: err.faultstring || (e as Error).message }, { status: err.http || 500 });
  }
}
