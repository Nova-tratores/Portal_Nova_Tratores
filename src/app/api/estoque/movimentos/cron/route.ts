import { NextRequest, NextResponse } from 'next/server';
import { sincronizarIncremental } from '@/lib/estoque/movimentos-sync';
import { comCronRun } from '@/lib/cron/observar';

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

  // Job por conta, resiliente (uma conta falhando não derruba a outra).
  const job = async () => {
    const rs: Array<Record<string, unknown>> = [];
    for (const c of contas) {
      try { const r = await sincronizarIncremental(c, opts); console.log(`[mov-cron] ${c}: ${JSON.stringify(r)}`); rs.push({ ...r, conta: c }); }
      catch (e) { console.error(`[mov-cron] ${c} falhou: ${(e as Error).message}`); rs.push({ conta: c, erro: (e as Error).message }); }
    }
    return rs;
  };

  if (wait) {
    const r = await comCronRun('estoque-sync-movimentos', job, { lockMinutos: 30 });
    return NextResponse.json({ sucesso: !r.erro, pulado: r.pulado, resultados: r.resultado, timestamp: new Date().toISOString() });
  }
  // fire-and-forget: dispara e responde na hora.
  comCronRun('estoque-sync-movimentos', job, { lockMinutos: 30 })
    .then((r) => { if (r.pulado) console.log('[mov-cron] pulado (já rodando)'); })
    .catch((e) => console.error('[mov-cron]', (e as Error).message));
  return NextResponse.json({ sucesso: true, disparado: true, contas, grupo, janelaDias, timestamp: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
