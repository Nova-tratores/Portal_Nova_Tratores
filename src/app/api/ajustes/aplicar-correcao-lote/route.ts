import { NextRequest, NextResponse } from 'next/server';
import { aplicarCorrecoesLote, type CorrecaoBody } from '@/lib/ajustes/cmc';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// WRITE no Omie: aplica um lote de correções de CMC (com throttle entre elas).
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { correcoes?: CorrecaoBody[]; criadoPor?: string };
    const correcoes = Array.isArray(body.correcoes) ? body.correcoes : [];
    if (correcoes.length === 0) {
      return NextResponse.json({ ok: false, erro: 'nenhuma correcao informada' }, { status: 400 });
    }
    const r = await aplicarCorrecoesLote(correcoes, body.criadoPor || 'app-lote');
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
