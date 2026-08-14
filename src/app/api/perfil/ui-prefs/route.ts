import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Preferências de UI por usuário (ordem/visibilidade de colunas etc).
// Tabela genérica portal_ui_prefs (user_id, chave, valor jsonb). A escrita
// passa pelo servidor (service role) porque o RLS bloqueia escrita do cliente.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// GET /api/perfil/ui-prefs?user_id=...&chave=...
// Retorna { valor } (objeto jsonb) ou { valor: null } se ainda não existir.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id');
  const chave = req.nextUrl.searchParams.get('chave');
  if (!userId || !chave) {
    return NextResponse.json({ error: 'user_id e chave são obrigatórios.' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('portal_ui_prefs')
    .select('valor')
    .eq('user_id', userId)
    .eq('chave', chave)
    .maybeSingle();
  if (error) {
    console.error('[ui-prefs] GET erro:', error.message);
    return NextResponse.json({ error: 'Falha ao carregar preferências.' }, { status: 500 });
  }
  return NextResponse.json({ valor: data?.valor ?? null });
}

// PUT /api/perfil/ui-prefs
// body: { user_id, chave, valor }  — grava (upsert) o objeto de preferência.
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id || '').trim();
  const chave = String(body.chave || '').trim();
  const valor = body.valor;
  if (!userId || !chave) {
    return NextResponse.json({ error: 'user_id e chave são obrigatórios.' }, { status: 400 });
  }
  if (valor == null || typeof valor !== 'object') {
    return NextResponse.json({ error: 'valor deve ser um objeto.' }, { status: 400 });
  }
  const { error } = await supabase
    .from('portal_ui_prefs')
    .upsert(
      { user_id: userId, chave, valor, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,chave' },
    );
  if (error) {
    console.error('[ui-prefs] PUT erro:', error.message);
    return NextResponse.json({ error: 'Falha ao salvar preferências.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
