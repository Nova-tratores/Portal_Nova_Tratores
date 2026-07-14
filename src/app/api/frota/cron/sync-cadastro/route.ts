// Cron: espelha o CADASTRO da Rota Exata (veículos, motoristas, vínculos,
// geocercas, odômetro). 1x/dia via GitHub Actions (frota-sync-cadastro.yml).
// Aceita também um admin logado (pra rodar manualmente do portal).
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { syncCadastro } from '@/lib/frota/sync';

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
    const resumo = await syncCadastro();
    console.log('[frota] sync-cadastro OK:', JSON.stringify(resumo));
    return NextResponse.json({ ok: true, resumo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[frota] sync-cadastro FALHOU:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
