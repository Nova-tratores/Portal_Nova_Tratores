import { NextRequest, NextResponse } from 'next/server';
import { iniciarSyncCaracteristicas } from '@/lib/ajustes/caracteristicas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Inicia a varredura de características (todas as contas) em background (worker-ready).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { criadoPor?: string };
  try {
    const r = await iniciarSyncCaracteristicas(body.criadoPor);
    return NextResponse.json(r, { status: r.jaRodando ? 409 : 202 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
