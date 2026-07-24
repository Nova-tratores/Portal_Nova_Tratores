// Avisos agendados — solta os que chegaram na hora e avisa o criador.
// Chamado pelo GitHub Actions (.github/workflows/avisos-publicar.yml) com
// x-cron-secret. Publica todo aviso com publicado=false e agendar_para <= agora.
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { publicarAviso } from '@/lib/avisos/publicar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function executar(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
    if (provided !== secret) return NextResponse.json({ ok: false, erro: 'unauthorized' }, { status: 401 });
  }
  const agora = new Date().toISOString();
  const { data: pendentes, error } = await supabase
    .from('portal_avisos')
    .select('id')
    .eq('publicado', false)
    .not('agendar_para', 'is', null)
    .lte('agendar_para', agora)
    .limit(200);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  let publicados = 0;
  for (const a of pendentes || []) {
    const r = await publicarAviso(a.id, { notificarCriador: true });
    if (r.ok) publicados++;
  }
  return NextResponse.json({ ok: true, publicados });
}

export async function POST(req: NextRequest) { return executar(req); }
export async function GET(req: NextRequest) { return executar(req); }
