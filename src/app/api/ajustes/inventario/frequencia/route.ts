import { NextRequest, NextResponse } from 'next/server';
import { setFrequencia } from '@/lib/ajustes/inventario';
import type { HttpError } from '@/lib/ajustes/cmc';

export const dynamic = 'force-dynamic';

// Frequência manual de contagem de um SKU (sobrevive ao recálculo).
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => ({}))) as { sku?: string; dias?: number | string };
    if (!b.sku) return NextResponse.json({ ok: false, erro: 'informe sku' }, { status: 400 });
    const r = await setFrequencia(b.sku, b.dias);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const err = e as HttpError;
    return NextResponse.json({ ok: false, erro: err.message }, { status: err.http || 500 });
  }
}
