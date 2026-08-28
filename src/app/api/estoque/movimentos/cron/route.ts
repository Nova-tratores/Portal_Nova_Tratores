import { NextRequest, NextResponse } from 'next/server';
import { sincronizarIncremental } from '@/lib/estoque/movimentos-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

// Cron diário do LIVRO-RAZÃO de estoque: re-sincroniza a janela recente dos produtos
// com movimento no mês (mais desatualizados primeiro). Idempotente. Fire-and-forget
// por padrão (Railway mantém o processo) — a request volta na hora; use ?wait=1 p/
// aguardar (teste manual). Auth via Bearer CRON_SECRET (GitHub Action).
const CRON_SECRET = process.env.CRON_SECRET || '';
function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  return !!CRON_SECRET && auth === `Bearer ${CRON_SECRET}`;
}

async function handle(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const grupo: 'peca' | 'maquina' = sp.get('grupo') === 'maquina' ? 'maquina' : 'peca';
  const janelaDias = Math.min(180, Math.max(15, parseInt(sp.get('dias') || '60') || 60));
  const wait = sp.get('wait') === '1';
  const maxMin = Math.min(20, Math.max(1, parseInt(sp.get('max_min') || '13') || 13));
  const contas = ['NOVA', 'CASTRO'] as const;
  const opts = { grupo, janelaDias, maxMs: maxMin * 60 * 1000 };

  if (wait) {
    const resultados = [];
    for (const c of contas) resultados.push(await sincronizarIncremental(c, opts));
    return NextResponse.json({ sucesso: true, resultados, timestamp: new Date().toISOString() });
  }
  // fire-and-forget: dispara e responde na hora.
  (async () => {
    for (const c of contas) {
      try { const r = await sincronizarIncremental(c, opts); console.log(`[mov-cron] ${c}: ${JSON.stringify(r)}`); }
      catch (e) { console.error(`[mov-cron] ${c} falhou: ${(e as Error).message}`); }
    }
  })();
  return NextResponse.json({ sucesso: true, disparado: true, contas, grupo, janelaDias, timestamp: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
