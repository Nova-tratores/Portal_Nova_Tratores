import { NextRequest, NextResponse } from 'next/server';
import { iniciarRecalculo } from '@/lib/ajustes/inventario';
import type { HttpError } from '@/lib/ajustes/cmc';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Dispara o recálculo da curva ABC (cross-conta) em background (worker-ready).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { criadoPor?: string };
  try {
    const r = await iniciarRecalculo(body.criadoPor);
    return NextResponse.json(r, { status: 202 });
  } catch (e) {
    const err = e as HttpError;
    return NextResponse.json({ ok: false, erro: err.message }, { status: err.http || 500 });
  }
}
