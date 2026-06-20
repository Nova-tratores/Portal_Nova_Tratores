import { NextRequest, NextResponse } from 'next/server';
import { aplicarAjusteCusto, type CorrecaoBody, type HttpError } from '@/lib/ajustes/cmc';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// WRITE no Omie: aplica o CMC inicial de um produto (resolve local ao vivo).
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as CorrecaoBody;
    const r = await aplicarAjusteCusto(body, body.criadoPor || 'ajuste-custos');
    return NextResponse.json(r);
  } catch (e) {
    const err = e as HttpError;
    return NextResponse.json(
      { ok: false, erro: err.message, correcaoId: err.correcaoId ?? null },
      { status: err.http || 400 },
    );
  }
}
