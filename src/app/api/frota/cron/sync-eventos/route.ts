// Cron: espelha os EVENTOS da Rota Exata (multas, manutenções, custos).
// 2x/dia via GitHub Actions (frota-sync-eventos.yml) — multa e manutenção
// mudam no meio do dia. Aceita também um admin logado.
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { syncEventos } from '@/lib/frota/sync';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  const ehCron = !!CRON_SECRET && header === `Bearer ${CRON_SECRET}`;
  if (!ehCron) {
    const auth = await autenticar(req);
    if (!auth?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const resumo = await syncEventos();
    console.log('[frota] sync-eventos OK:', JSON.stringify(resumo));
    return NextResponse.json({ ok: true, resumo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[frota] sync-eventos FALHOU:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
