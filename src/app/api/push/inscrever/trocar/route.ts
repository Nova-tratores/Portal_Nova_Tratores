// O navegador trocou a inscrição sozinho (pushsubscriptionchange do public/sw.js). Sem login: o aparelho
// manda o endpoint ANTIGO (segredo dele) e só a linha desse endpoint é trocada pela nova, mesmo dono.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

interface Inscricao { endpoint?: string; keys?: { p256dh?: string; auth?: string } }

function valida(i: Inscricao | undefined): i is Required<Inscricao> {
  return !!i && typeof i.endpoint === 'string' && i.endpoint.startsWith('https://') && !!i.keys?.p256dh && !!i.keys?.auth;
}

export async function POST(req: NextRequest) {
  const { antigo, inscricao } = await req.json().catch(() => ({}));
  if (typeof antigo !== 'string' || !valida(inscricao)) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  const { data } = await supabaseAdmin.from('portal_push_inscricoes').select('user_id, aparelho, navegador').eq('endpoint', antigo).maybeSingle();
  if (!data) return NextResponse.json({ ok: false }, { status: 404 });
  await supabaseAdmin.from('portal_push_inscricoes').delete().eq('endpoint', antigo);
  await supabaseAdmin.from('portal_push_inscricoes').upsert({
    endpoint: inscricao.endpoint,
    user_id: data.user_id,
    inscricao: { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.keys.p256dh, auth: inscricao.keys.auth } },
    aparelho: data.aparelho,
    navegador: data.navegador,
    atualizado_em: new Date().toISOString(),
    falhas: 0,
  }, { onConflict: 'endpoint' });
  return NextResponse.json({ ok: true });
}
