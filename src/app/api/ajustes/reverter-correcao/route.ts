import { NextRequest, NextResponse } from 'next/server';
import { reverterCorrecao, type HttpError } from '@/lib/ajustes/cmc';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// WRITE no Omie: reverte uma correção (ExcluirAjusteEstoque) + marca revertido.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { correcaoId?: number | string; id?: number | string };
    const correcaoId = body.correcaoId ?? body.id;
    if (correcaoId == null) return NextResponse.json({ ok: false, erro: 'informe correcaoId' }, { status: 400 });
    const r = await reverterCorrecao(Number(correcaoId));
    return NextResponse.json(r);
  } catch (e) {
    const err = e as HttpError;
    return NextResponse.json({ ok: false, erro: err.message }, { status: err.http || 500 });
  }
}
