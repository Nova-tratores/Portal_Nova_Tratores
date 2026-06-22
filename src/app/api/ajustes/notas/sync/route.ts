import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { syncNotasSaida, syncNotasTodasContas } from '@/lib/ajustes/notas-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

// Trigger manual do sync de notas (backfill/incremental). Protegido por Bearer
// CRON_SECRET quando definido; aberto quando nao ha secret (uso local/backfill).
const CRON_SECRET = process.env.CRON_SECRET || '';
function autorizado(req: NextRequest): boolean {
  if (!CRON_SECRET) return true; // dev/local sem secret
  return (req.headers.get('authorization') || '') === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const modo = (sp.get('modo') === 'backfill' ? 'backfill' : 'incremental') as 'backfill' | 'incremental';
  const desdeBR = sp.get('desde') || undefined;
  const ateBR = sp.get('ate') || undefined;
  const contaRaw = parseConta(sp.get('conta'));
  const log = (m: string) => console.log('[api notas/sync]', m);
  try {
    const resultado = contaRaw
      ? [await syncNotasSaida(contaRaw, { modo, desdeBR, ateBR, onProgress: log })]
      : await syncNotasTodasContas({ modo, desdeBR, ateBR, onProgress: log });
    return NextResponse.json({ sucesso: true, modo, resultado, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: (e as Error).message }, { status: 500 });
  }
}

export const POST = GET;
