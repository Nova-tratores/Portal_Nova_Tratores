import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { iniciarScanNegativos } from '@/lib/ajustes/negativos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Inicia a varredura de estoque negativo em background (worker-ready: ajustes_jobs).
export async function POST(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const body = (await req.json().catch(() => ({}))) as { criadoPor?: string };
  try {
    const r = await iniciarScanNegativos(conta, body.criadoPor);
    return NextResponse.json(r, { status: 202 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
