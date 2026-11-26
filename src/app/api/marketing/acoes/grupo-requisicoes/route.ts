/* eslint-disable @typescript-eslint/no-explicit-any */
// Grupo de requisições ↔ evento/campanha do Marketing (José, 23/11/2026).
// Quem cria um grupo e tem acesso ao Marketing responde "é para um evento?" e liga o grupo a um evento aberto
// ou cria um novo. Coluna requisicao_grupos.mkt_acao_id (sql/marketing-evento-interno.sql).
//
// GET  /api/marketing/acoes/grupo-requisicoes            → eventos/campanhas abertos para escolher
// POST /api/marketing/acoes/grupo-requisicoes { grupo_id, acao_id }                     → liga a um existente
// POST /api/marketing/acoes/grupo-requisicoes { grupo_id, criar: { nome, tipo, data_inicio? } } → cria e liga
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { db } from '@/lib/marketing/db';
import { logMarketing, nomeDoUsuario } from '@/lib/marketing/server';
import { TIPOS_ACAO } from '@/lib/marketing/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;
  try {
    const { data, error } = await db.from('mkt_acoes')
      .select('id, nome, tipo, status, data_inicio, data_fim')
      .is('deleted_at', null)
      .not('status', 'in', '(realizada,cancelada)')
      .order('data_inicio', { ascending: true, nullsFirst: false })
      .limit(100);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    // 24/11/2026: campanha nova já nasce com grupo — marca quais já têm, para ninguém ligar outro sem querer
    const ids = (data ?? []).map((a: any) => a.id);
    const { data: ligados } = ids.length
      ? await db.from('requisicao_grupos').select('mkt_acao_id').in('mkt_acao_id', ids)
      : { data: [] as any[] };
    const comGrupo = new Set((ligados ?? []).map((g: any) => g.mkt_acao_id));
    return NextResponse.json({ acoes: (data ?? []).map((a: any) => ({ ...a, tem_grupo: comGrupo.has(a.id) })) });
  } catch (e) {
    return erroResposta(e, 'GET /acoes/grupo-requisicoes');
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const criar = body?.criar && typeof body.criar === 'object' ? body.criar : null;
  const g = await guardar(req, 'marketing', criar ? 'acoes:criar' : 'acoes:editar');
  if (g.resposta) return g.resposta;
  try {
    const grupoId = Number(body.grupo_id);
    if (!Number.isInteger(grupoId) || grupoId <= 0) return NextResponse.json({ error: 'grupo_id inválido' }, { status: 400 });
    const { data: grupo } = await db.from('requisicao_grupos').select('id, nome, historico').eq('id', grupoId).maybeSingle();
    if (!grupo) return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 });

    let acao: { id: string; nome: string } | null = null;
    if (criar) {
      const nome = String(criar.nome || grupo.nome || '').trim().slice(0, 200);
      if (!nome) return NextResponse.json({ error: 'Informe o nome do evento' }, { status: 400 });
      const tipo = TIPOS_ACAO.some((t) => t.id === criar.tipo) ? criar.tipo : 'evento_interno';
      const dataInicio = /^\d{4}-\d{2}-\d{2}$/.test(String(criar.data_inicio || '')) ? criar.data_inicio : null;
      const autor = await nomeDoUsuario(g.auth);
      const { data, error } = await db.from('mkt_acoes')
        .insert([{ nome, tipo, status: 'planejada', empresa: 'NOVA', data_inicio: dataInicio, data_fim: dataInicio, criado_por_id: g.auth.userId, criado_por_nome: autor }])
        .select('id, nome').single();
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      acao = data;
      await logMarketing(g.auth, { acao: 'criar', entidade: 'acao', entidadeId: data.id, entidadeLabel: data.nome, detalhes: { tipo, origem: 'grupo_requisicoes', grupo_id: grupoId } });
    } else {
      const { data } = await db.from('mkt_acoes').select('id, nome').eq('id', String(body.acao_id || '')).is('deleted_at', null).maybeSingle();
      if (!data) return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 });
      acao = data;
    }

    // liga o grupo e deixa registrado no histórico dele (mesmo formato de /api/pos/requisicoes/grupos)
    const em = new Date().toISOString();
    const historico = [...((grupo.historico as any[]) || []), { acao: 'evento', usuario: await nomeDoUsuario(g.auth), em, detalhe: `Ligado ao evento "${acao!.nome}" (Marketing)` }];
    const { error: e2 } = await db.from('requisicao_grupos').update({ mkt_acao_id: acao!.id, historico, updated_at: em }).eq('id', grupoId);
    if (e2) {
      if (/mkt_acao_id/.test(e2.message)) return NextResponse.json({ error: 'Falta rodar sql/marketing-evento-interno.sql no Supabase.' }, { status: 500 });
      throw Object.assign(new Error(e2.message), { code: e2.code });
    }
    return NextResponse.json({ ok: true, acao });
  } catch (e) {
    return erroResposta(e, 'POST /acoes/grupo-requisicoes');
  }
}
