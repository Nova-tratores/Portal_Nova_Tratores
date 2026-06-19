import { NextRequest, NextResponse } from 'next/server';
import { setCuradoria } from '@/lib/ajustes/inventario';
import type { HttpError } from '@/lib/ajustes/cmc';

export const dynamic = 'force-dynamic';

// Liga/desliga um SKU do inventário (curadoria manual).
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => ({}))) as { sku?: string; ativo?: boolean | number };
    if (!b.sku) return NextResponse.json({ ok: false, erro: 'informe sku' }, { status: 400 });
    const r = await setCuradoria(b.sku, b.ativo !== false && b.ativo !== 0);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const err = e as HttpError;
    return NextResponse.json({ ok: false, erro: err.message }, { status: err.http || 500 });
  }
}
