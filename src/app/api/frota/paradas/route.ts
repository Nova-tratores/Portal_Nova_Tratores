// PATCH /api/frota/paradas — justificar/ignorar uma parada atípica.
// Permissão: frota:paradas:justificar. É o payoff operacional: a parada
// estranha vira um registro explicado (quem justificou e quando).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota } from '@/lib/frota/server';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'paradas:justificar')) {
    return NextResponse.json({ error: 'Sem permissão para justificar paradas.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '');
  if (!id) return NextResponse.json({ error: 'Informe o id da parada.' }, { status: 400 });

  const upd: Record<string, unknown> = {};
  if (body.justificativa !== undefined) {
    upd.justificativa = String(body.justificativa || '').trim() || null;
    upd.justificado_por = auth.email || auth.userId;
    upd.justificado_em = new Date().toISOString();
  }
  if (body.ignorada !== undefined) upd.ignorada = !!body.ignorada;
  if (Object.keys(upd).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });
  }

  const { data: antes } = await supabase
    .from('frota_paradas')
    .select('placa, data, duracao_min')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('frota_paradas').update(upd).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logFrota(auth, {
    acao: 'editar',
    entidade: 'parada',
    entidadeId: id,
    entidadeLabel: antes ? `Parada ${antes.placa} ${antes.data} (${antes.duracao_min}min)` : `Parada ${id.slice(0, 8)}`,
    detalhes: upd,
  });

  return NextResponse.json({ ok: true });
}
