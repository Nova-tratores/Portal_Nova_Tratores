import { NextRequest, NextResponse } from 'next/server';
import { aplicarUmaCorrecao, type CorrecaoBody, type HttpError } from '@/lib/ajustes/cmc';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// WRITE no Omie: aplica uma correção de CMC (SLD) + grava auditoria em cmc_correcoes.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as CorrecaoBody;
    const r = await aplicarUmaCorrecao(body, body.criadoPor);
    return NextResponse.json(r);
  } catch (e) {
    const err = e as HttpError;
    return NextResponse.json(
      { ok: false, erro: err.message, correcaoId: err.correcaoId ?? null },
      { status: err.http || 400 },
    );
  }
}
