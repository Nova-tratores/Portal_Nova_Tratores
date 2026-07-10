import { NextRequest, NextResponse } from 'next/server';
import { sincronizarSelic } from '@/lib/visual-estoque/selic-sync';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Atualiza o cache de SELIC (`selic_cache`) com as taxas diárias novas do BCB.
// Alimenta o custo de capital do /visual-estoque. Substitui o selic.js do app
// externo "Visual Estoque". Job leve (fetch incremental) — pode ser síncrono.
// Disparado por cron com Bearer CRON_SECRET.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const resultado = await sincronizarSelic();
    return NextResponse.json({ sucesso: resultado.ok, resultado, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: (e as Error).message }, { status: 500 });
  }
}
