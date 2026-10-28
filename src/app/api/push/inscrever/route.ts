// Inscrição do aparelho para receber avisos com o portal fechado (28/10/2026).
// POST = este aparelho passa a receber (dono = login); DELETE = para de receber.
// Troca automática da inscrição pelo navegador: ./trocar (sem login).
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

interface Inscricao { endpoint?: string; keys?: { p256dh?: string; auth?: string } }

function valida(i: Inscricao | undefined): i is Required<Inscricao> {
  return !!i && typeof i.endpoint === 'string' && i.endpoint.startsWith('https://') && !!i.keys?.p256dh && !!i.keys?.auth;
}

function navegadorDe(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac/i.test(ua)) return 'Mac';
  return 'Outro';
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { inscricao, aparelho } = await req.json().catch(() => ({}));
  if (!valida(inscricao)) return NextResponse.json({ error: 'Inscrição inválida' }, { status: 400 });
  const ua = req.headers.get('user-agent') || '';
  const { error } = await supabaseAdmin.from('portal_push_inscricoes').upsert({
    endpoint: inscricao.endpoint,
    user_id: auth.userId,
    inscricao: { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.keys.p256dh, auth: inscricao.keys.auth } },
    aparelho: aparelho === 'celular' ? 'celular' : 'computador',
    navegador: navegadorDe(ua),
    atualizado_em: new Date().toISOString(),
    falhas: 0,
  }, { onConflict: 'endpoint' });
  if (error) {
    if (/portal_push_inscricoes|schema cache|does not exist/i.test(error.message)) {
      return NextResponse.json({ error: 'Avisos no celular ainda não instalados no banco (sql/portal-push.sql).', migracaoFaltando: true }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { endpoint } = await req.json().catch(() => ({}));
  if (typeof endpoint !== 'string') return NextResponse.json({ error: 'Sem endpoint' }, { status: 400 });
  await supabaseAdmin.from('portal_push_inscricoes').delete().eq('endpoint', endpoint).eq('user_id', auth.userId);
  return NextResponse.json({ ok: true });
}
