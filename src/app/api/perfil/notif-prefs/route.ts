import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { sanitizarSilenciados, modulosObrigatorios } from '@/lib/notif/prefs';

// GET /api/perfil/notif-prefs?user_id=...
// Retorna preferências atuais + lista de módulos obrigatórios (não desativáveis).
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id');
  if (!userId) {
    return NextResponse.json({ error: 'user_id é obrigatório.' }, { status: 400 });
  }
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
// body: { user_id, silenciados: string[] }
// Sanitiza removendo obrigatórios (segurança server-side).
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id || '').trim();
  const silenciadosIn = Array.isArray(body.silenciados) ? body.silenciados.map(String) : [];
  if (!userId) {
    return NextResponse.json({ error: 'user_id é obrigatório.' }, { status: 400 });
  }

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
