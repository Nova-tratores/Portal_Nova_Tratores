import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exigirAdmin } from '@/lib/auth/server';

// Reatribui EM MASSA as tarefas ABERTAS de um usuário para outro (ex.: ao desativar
// alguém, ou no painel de "órfãs"). Só admin. POST { de_user_id, para_user_id }.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const de = String(body.de_user_id || '').trim();
  const para = String(body.para_user_id || '').trim();
  if (!para) return NextResponse.json({ error: 'para_user_id obrigatório' }, { status: 400 });

  // `de` vazio = reatribui as SEM responsável (atribuido_a nulo).
  let q = supabase.from('portal_tarefas').update({ atribuido_a: para }).eq('concluida', false);
  q = de ? q.eq('atribuido_a', de) : q.is('atribuido_a', null);
  const { data, error } = await q.select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reatribuidas: (data || []).length });
}
