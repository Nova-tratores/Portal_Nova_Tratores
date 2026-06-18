import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { setTipo } from '@/lib/estoque/recebimentos';

export const dynamic = 'force-dynamic';

// Tipo manual -> recebimento_meta. Portado de POST /api/recebimentos/:id/tipo (server.js:7723).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { tipo?: string };
    await setTipo(conta, parseInt(id, 10), String(body.tipo || ''));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg === 'tipo invalido' || msg === 'conta obrigatoria' ? 400 : 500;
    return NextResponse.json({ erro: msg }, { status });
  }
}
