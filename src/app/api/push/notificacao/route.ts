// Chamada pelo BANCO (gatilho portal_notificacao_push, sql/portal-push.sql) a cada aviso novo do sino:
// manda o push para os aparelhos do dono do aviso. Sem login de propósito — o corpo só traz o id;
// título/texto/destino são relidos do banco, cada aviso sai uma vez só (portal_push_enviados) e
// só aviso de até 10 min. Quem chamar à toa no máximo antecipa um push que já ia sair.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { enviarPushUsuario, pushLigado } from '@/lib/push/portal-server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;
const JANELA_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== 'string' || !UUID.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  if (!pushLigado()) return NextResponse.json({ ok: true, pulado: 'VAPID não configurado' });

  const { data: n } = await supabaseAdmin.from('portal_notificacoes')
    .select('id, user_id, titulo, descricao, link, created_at').eq('id', id).maybeSingle();
  if (!n) return NextResponse.json({ ok: false }, { status: 404 });
  if (Date.now() - new Date(n.created_at).getTime() > JANELA_MS) return NextResponse.json({ ok: true, pulado: 'antigo' });

  // Uma vez só por aviso (chave primária barra a 2ª)
  const { error: dup } = await supabaseAdmin.from('portal_push_enviados').insert({ notificacao_id: n.id });
  if (dup) return NextResponse.json({ ok: true, pulado: 'já enviado' });

  const r = await enviarPushUsuario(n.user_id, {
    titulo: n.titulo || 'Portal Nova Tratores',
    corpo: n.descricao || '',
    link: n.link || '/dashboard',
    tag: 'notif-' + n.id,
  });
  return NextResponse.json({ ok: true, ...r });
}
