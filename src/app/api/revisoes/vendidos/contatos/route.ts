import { NextRequest, NextResponse } from 'next/server';
import { autorDe, protegerRota } from '@/lib/ajustes/permissao-server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { validarContato } from '@/lib/revisoes/contatos-radar';

export const dynamic = 'force-dynamic';

// Ligações dos 30/60/90 dias do Radar de tratores (Feedbacks → Tratores).
// GET ?desde=AAAA-MM-DD → registros desde a data (a tela passa o início do período das vendas).
// POST { chave, marco, resultado, nota?, motivo?, horimetro?, retornar_em? } → grava uma ligação; autor = quem está logado.
// Tabela radar_tratores_contatos (sql/radar-tratores-contatos.sql); sem ela o GET devolve
// `semTabela` e o POST responde 503.

const TABELA = 'radar_tratores_contatos';
const faltaTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /radar_tratores_contatos/.test(e.message || ''));

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'revisoes' }, { modulo: 'feedbacks' }]);
  if (g.resposta) return g.resposta;
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.nextUrl.searchParams.get('desde') || '') ? req.nextUrl.searchParams.get('desde')! : '2000-01-01';
  const { data, error } = await supabaseAdmin.from(TABELA)
    .select('*')
    .gte('criado_em', desde).order('criado_em', { ascending: false }).limit(5000);
  if (faltaTabela(error)) return NextResponse.json({ ok: true, contatos: [], semTabela: true });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, contatos: data || [] });
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'revisoes' }, { modulo: 'feedbacks' }]);
  if (g.resposta) return g.resposta;
  const corpo = await req.json().catch(() => ({}));
  const v = validarContato(corpo);
  if (!v.ok) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400 });
  const { data, error } = await supabaseAdmin.from(TABELA).insert({
    chave: v.chave, marco: v.marco, resultado: v.resultado, nota: v.nota, user_id: g.user.id, user_nome: autorDe(g.user),
    ...(v.resultado === 'sem_revisao' ? { motivo: v.motivo, horimetro: v.horimetro } : {}),
    ...(v.retornar_em ? { retornar_em: v.retornar_em } : {}),
  }).select('*').single();
  if (error && (v.resultado === 'sem_revisao' || v.retornar_em) && (error.code === '42703' || error.code === '23514' || /motivo|horimetro|retornar_em|resultado_check/.test(error.message || ''))) {
    return NextResponse.json({ ok: false, erro: 'Falta rodar o SQL radar-tratores-motivo no banco.' }, { status: 503 });
  }
  if (faltaTabela(error)) return NextResponse.json({ ok: false, erro: 'Falta rodar o SQL radar-tratores-contatos no banco.' }, { status: 503 });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  await supabaseAdmin.from('audit_log').insert({
    sistema: 'feedbacks', acao: 'ligacao_trator', entidade: 'trator_vendido', entidade_id: v.chave,
    entidade_label: `${v.marco} dias · ${v.resultado}`, user_id: g.user.id, user_nome: autorDe(g.user), detalhes: { nota: v.nota, motivo: v.motivo, horimetro: v.horimetro },
  }).then(() => null, () => null);
  // fecha o atendimento em andamento do trator ("Iniciar atendimento" na ficha); sem a tabela, nada a fazer
  const atendId = typeof (corpo as { atendimento_id?: unknown }).atendimento_id === 'string' ? (corpo as { atendimento_id: string }).atendimento_id : null;
  await supabaseAdmin.from('radar_tratores_atendimentos')
    .update({ encerrado_em: new Date().toISOString(), desfecho: 'registrado', contato_id: data.id, encerrado_por: autorDe(g.user) })
    .eq(atendId && /^[0-9a-f-]{36}$/i.test(atendId) ? 'id' : 'chave', atendId && /^[0-9a-f-]{36}$/i.test(atendId) ? atendId : v.chave)
    .is('encerrado_em', null)
    .then(() => null, () => null);
  return NextResponse.json({ ok: true, contato: data });
}
