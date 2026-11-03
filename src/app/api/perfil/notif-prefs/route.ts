import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sanitizarSilenciados, modulosObrigatorios } from '@/lib/notif/prefs';
import { autenticar } from '@/lib/auth/server';

// Service role: a escrita em portal_permissoes (notif_silenciado) precisa passar
// pelo servidor porque o RLS agora bloqueia escrita do cliente nessa tabela.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Preferência é SEMPRE do usuário do login: o user_id da query/corpo é ignorado
// (antes dava para ler/gravar a de qualquer pessoa passando o id dela).

// GET /api/perfil/notif-prefs
// Retorna preferências atuais + lista de módulos obrigatórios (não desativáveis).
export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const userId = auth.userId;
  const { data, error } = await supabase
    .from('portal_permissoes')
    .select('categoria, notif_silenciado, is_admin')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[notif-prefs] GET erro:', error.message);
    return NextResponse.json({ error: 'Falha ao carregar preferências.' }, { status: 500 });
  }
  const categoria = data?.categoria || null;
  return NextResponse.json({
    categoria,
    is_admin: data?.is_admin ?? false,
    silenciados: data?.notif_silenciado || [],
    obrigatorios: modulosObrigatorios(categoria),
  });
}

// PATCH /api/perfil/notif-prefs
// body: { silenciados: string[] }
// Sanitiza removendo obrigatórios (segurança server-side).
export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const userId = auth.userId;
  const silenciadosIn = Array.isArray(body.silenciados) ? body.silenciados.map(String) : [];

  // Carrega categoria pra aplicar a regra de obrigatórios
  const { data: row } = await supabase
    .from('portal_permissoes')
    .select('categoria')
    .eq('user_id', userId)
    .maybeSingle();

  const silenciadosLimpos = sanitizarSilenciados(silenciadosIn, row?.categoria);

  // upsert pra cobrir o caso de usuário ainda sem linha de permissão
  const { error } = await supabase
    .from('portal_permissoes')
    .upsert(
      { user_id: userId, notif_silenciado: silenciadosLimpos, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) {
    console.error('[notif-prefs] PATCH erro:', error.message);
    return NextResponse.json({ error: 'Falha ao salvar preferências.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    silenciados: silenciadosLimpos,
    obrigatorios: modulosObrigatorios(row?.categoria),
  });
}
