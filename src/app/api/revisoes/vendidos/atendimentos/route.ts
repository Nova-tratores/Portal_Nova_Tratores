import { NextRequest, NextResponse } from 'next/server';
import { autorDe, protegerRota } from '@/lib/ajustes/permissao-server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

// Atendimentos EM ANDAMENTO do Radar de tratores (José, 28/10/2026: "coloca iniciar atendimento, pra gente
// conseguir fazer uma aba de atendimentos em andamento").
// GET → os abertos (encerrado_em nulo), do mais novo ao mais velho.
// POST { acao: 'iniciar', chave, marco? } → abre (se já tem um aberto para o trator, devolve esse, com `ja`).
// POST { acao: 'cancelar' | 'encerrar', id } → fecha sem registro / registrado (revisões: o contato é gravado
// por /api/feedbacks/crm/revisoes e a tela encerra aqui). Chave das revisões = 'rev:<id do trator>'.
// O registro da ligação (POST /api/revisoes/vendidos/contatos com atendimento_id) fecha como 'registrado'.
// Tabela radar_tratores_atendimentos (sql/radar-tratores-atendimentos.sql); sem ela GET devolve
// `semTabela` e POST responde 503 com `semTabela`.

const TABELA = 'radar_tratores_atendimentos';
const faltaTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /radar_tratores_atendimentos/.test(e.message || ''));
const semTabela = () => NextResponse.json({ ok: false, semTabela: true, erro: 'Falta rodar o SQL radar-tratores-atendimentos no banco.' }, { status: 503 });

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'revisoes' }, { modulo: 'feedbacks' }]);
  if (g.resposta) return g.resposta;
  const { data, error } = await supabaseAdmin.from(TABELA).select('*').is('encerrado_em', null).order('iniciado_em', { ascending: false }).limit(500);
  if (faltaTabela(error)) return NextResponse.json({ ok: true, atendimentos: [], semTabela: true });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, atendimentos: data || [] });
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'revisoes' }, { modulo: 'feedbacks' }]);
  if (g.resposta) return g.resposta;
  const b = await req.json().catch(() => ({})) as { acao?: string; chave?: unknown; marco?: unknown; id?: unknown };

  if (b.acao === 'iniciar') {
    const chave = typeof b.chave === 'string' ? b.chave.trim() : '';
    if (!chave || chave.length > 200) return NextResponse.json({ ok: false, erro: 'Trator inválido.' }, { status: 400 });
    const marco = [30, 60, 90].includes(Number(b.marco)) ? Number(b.marco) : null;
    const aberto = await supabaseAdmin.from(TABELA).select('*').eq('chave', chave).is('encerrado_em', null).maybeSingle();
    if (faltaTabela(aberto.error)) return semTabela();
    if (aberto.data) return NextResponse.json({ ok: true, atendimento: aberto.data, ja: true });
    const { data, error } = await supabaseAdmin.from(TABELA).insert({ chave, marco, user_id: g.user.id, user_nome: autorDe(g.user) }).select('*').single();
    if (error?.code === '23505') { // outra pessoa abriu no mesmo instante
      const outro = await supabaseAdmin.from(TABELA).select('*').eq('chave', chave).is('encerrado_em', null).maybeSingle();
      return NextResponse.json({ ok: true, atendimento: outro.data, ja: true });
    }
    if (faltaTabela(error)) return semTabela();
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    await supabaseAdmin.from('audit_log').insert({
      sistema: 'feedbacks', acao: 'iniciar_atendimento_trator', entidade: 'trator_vendido', entidade_id: chave,
      entidade_label: marco ? `${marco} dias` : 'atendimento', user_id: g.user.id, user_nome: autorDe(g.user),
    }).then(() => null, () => null);
    return NextResponse.json({ ok: true, atendimento: data });
  }

  if (b.acao === 'cancelar' || b.acao === 'encerrar') {
    const id = typeof b.id === 'string' ? b.id : '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, erro: 'Atendimento inválido.' }, { status: 400 });
    const { error } = await supabaseAdmin.from(TABELA)
      .update({ encerrado_em: new Date().toISOString(), desfecho: b.acao === 'encerrar' ? 'registrado' : 'cancelado', encerrado_por: autorDe(g.user) })
      .eq('id', id).is('encerrado_em', null);
    if (faltaTabela(error)) return semTabela();
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erro: 'Ação inválida.' }, { status: 400 });
}
