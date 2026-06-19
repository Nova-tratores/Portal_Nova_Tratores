import { NextRequest, NextResponse } from 'next/server';
import { iniciarVerificacao } from '@/lib/ajustes/verificacao';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Dispara a verificacao diaria em background (worker-ready: job 'verificacao-diaria').
// 202 = iniciou; 409 = ja ha uma rodando.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { criadoPor?: string };
  try {
    const r = await iniciarVerificacao(body.criadoPor);
    return NextResponse.json(r, { status: r.jaRodando ? 409 : 202 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
