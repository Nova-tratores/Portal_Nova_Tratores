import { NextRequest, NextResponse } from 'next/server';
import { corrigirEstoqueNegativo, type CorrigirNegativoArgs } from '@/lib/ajustes/negativos';
import type { HttpError } from '@/lib/ajustes/cmc';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// WRITE no Omie: ajuste retroativo (SLD quan=0) para corrigir CMC de produto negativo.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as CorrigirNegativoArgs;
    const r = await corrigirEstoqueNegativo(body);
    return NextResponse.json(r);
  } catch (e) {
    const err = e as HttpError;
    return NextResponse.json(
      { ok: false, erro: err.message, correcaoId: err.correcaoId ?? null },
      { status: err.http || 500 },
    );
  }
}
