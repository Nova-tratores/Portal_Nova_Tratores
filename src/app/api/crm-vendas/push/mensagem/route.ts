// Chamada pelo BANCO (gatilho vendas_mensagem_push, vendas-pwa/supabase-push.sql) a cada
// mensagem nova do supervisor em mensagens_vendedor: manda o push para o celular do
// vendedor (ou de todos, quando vendedor_id é null). Sem login de propósito — o corpo só
// traz o id; título/texto/link são relidos do banco, cada mensagem sai uma vez só
// (vendas_push_enviados) e só mensagem de até 10 min. Molde: /api/push/notificacao.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { pushLigado } from '@/lib/push/portal-server';
import { enviarPushVendedor } from '@/lib/vendas-app/push-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JANELA_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  const { id } = await req.json().catch(() => ({}));
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  if (!pushLigado()) return NextResponse.json({ ok: true, pulado: 'VAPID não configurado' });

  const { data: m } = await supabaseAdmin.from('mensagens_vendedor')
    .select('id, vendedor_id, titulo, corpo, link, created_by, created_at').eq('id', n).maybeSingle();
  if (!m) return NextResponse.json({ ok: false }, { status: 404 });
  if (Date.now() - new Date(m.created_at).getTime() > JANELA_MS) return NextResponse.json({ ok: true, pulado: 'antiga' });

  const { error: dup } = await supabaseAdmin.from('vendas_push_enviados').insert({ chave: `msg:${m.id}` });
  if (dup) return NextResponse.json({ ok: true, pulado: 'já enviada' });

  const r = await enviarPushVendedor(m.vendedor_id == null ? null : Number(m.vendedor_id), {
    titulo: m.titulo || `Mensagem de ${m.created_by || 'Supervisor'}`,
    corpo: m.corpo || '',
    link: m.link || '/notificacoes',
    tag: `msg-${m.id}`,
  });
  return NextResponse.json({ ok: true, ...r });
}
