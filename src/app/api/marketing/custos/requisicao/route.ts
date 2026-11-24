/* eslint-disable @typescript-eslint/no-explicit-any */
// Requisição ↔ custo de evento/campanha (24/11/2026). Ver lib/marketing/requisicao-custo.ts.
//
// GET  ?req_id=6628   → { req: detalhe (quem pediu, itens, anexos), custos: [eventos onde ela já é custo] }
// GET  ?busca=texto   → { requisicoes: [...] } — "Puxar de uma requisição" no Novo custo (nº, título ou fornecedor)
// GET  ?acoes=1       → { acoes: [...] } — eventos/campanhas abertos (para escolher na tela da requisição)
// POST { req_id, acao_id } → lança a requisição como custo daquele evento (permissão custos:vincular)
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { db } from '@/lib/marketing/db';
import { logMarketing, nomeDoUsuario } from '@/lib/marketing/server';
import { detalheDaRequisicao, custoDaRequisicao, nomesDosSolicitantes, nomeSolicitante } from '@/lib/marketing/requisicao-custo';
import { parseValorMisto } from '@/lib/marketing/custos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;
  try {
    const url = new URL(req.url);

    if (url.searchParams.get('acoes')) {
      const { data, error } = await db.from('mkt_acoes')
        .select('id, nome, tipo, status, data_inicio')
        .is('deleted_at', null)
        .not('status', 'in', '(cancelada)')
        .order('data_inicio', { ascending: false, nullsFirst: false })
        .limit(150);
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return NextResponse.json({ acoes: data ?? [] });
    }

    const busca = url.searchParams.get('busca');
    if (busca !== null) {
      const t = busca.trim().replace(/[%,()]/g, ' ').trim();
      if (!t) return NextResponse.json({ requisicoes: [] });
      let q = db.from('Requisicao').select('id, titulo, fornecedor, data, valor_despeza, solicitante, status').neq('status', 'lixeira');
      const n = Number(t.replace(/^#/, ''));
      q = Number.isInteger(n) && n > 0 ? q.eq('id', n) : q.or(`titulo.ilike.%${t}%,fornecedor.ilike.%${t}%`);
      const { data, error } = await q.order('id', { ascending: false }).limit(20);
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      const mapa = await nomesDosSolicitantes((data ?? []).map((r: any) => r.solicitante));
      return NextResponse.json({
        requisicoes: (data ?? []).map((r: any) => ({
          id: r.id, titulo: r.titulo || `Requisição #${r.id}`, fornecedor: r.fornecedor, data: r.data,
          valor: parseValorMisto(r.valor_despeza), solicitante: nomeSolicitante(r.solicitante, mapa), status: r.status,
        })),
      });
    }

    const reqId = Number(url.searchParams.get('req_id'));
    if (!Number.isInteger(reqId) || reqId <= 0) return NextResponse.json({ error: 'Informe req_id' }, { status: 400 });
    const detalhe = await detalheDaRequisicao(reqId);
    if (!detalhe) return NextResponse.json({ error: 'Requisição não encontrada' }, { status: 404 });

    const { data: custos } = await db.from('mkt_custos')
      .select('id, acao_id, valor, rateio_percent, status')
      .eq('vinculo_tipo', 'requisicao').eq('vinculo_ref', String(reqId));
    const acaoIds = [...new Set((custos ?? []).map((c: any) => c.acao_id))];
    const nomes: Record<string, any> = {};
    if (acaoIds.length) {
      const { data: as } = await db.from('mkt_acoes').select('id, nome, tipo, deleted_at').in('id', acaoIds);
      for (const a of as ?? []) nomes[a.id] = a;
    }
    return NextResponse.json({
      req: detalhe,
      custos: (custos ?? [])
        .filter((c: any) => nomes[c.acao_id] && !nomes[c.acao_id].deleted_at)
        .map((c: any) => ({ ...c, acao_nome: nomes[c.acao_id].nome, acao_tipo: nomes[c.acao_id].tipo })),
    });
  } catch (e) {
    return erroResposta(e, 'GET /custos/requisicao');
  }
}

export async function POST(req: Request) {
  const g = await guardar(req, 'marketing', 'custos:vincular');
  if (g.resposta) return g.resposta;
  try {
    const body = await req.json().catch(() => ({} as any));
    const reqId = Number(body.req_id);
    if (!Number.isInteger(reqId) || reqId <= 0) return NextResponse.json({ error: 'Informe req_id' }, { status: 400 });
    const { data: acao } = await db.from('mkt_acoes').select('id, nome').eq('id', String(body.acao_id || '')).is('deleted_at', null).maybeSingle();
    if (!acao) return NextResponse.json({ error: 'Evento/campanha não encontrado' }, { status: 404 });

    const detalhe = await detalheDaRequisicao(reqId);
    if (!detalhe) return NextResponse.json({ error: 'Requisição não encontrada' }, { status: 404 });

    const autor = await nomeDoUsuario(g.auth);
    const { data, error } = await db.from('mkt_custos')
      .insert([{ ...custoDaRequisicao(detalhe), acao_id: acao.id, criado_por_id: g.auth.userId, criado_por_nome: autor }])
      .select('*').single();
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: `Esta requisição já é custo de "${acao.nome}".` }, { status: 409 });
      throw Object.assign(new Error(error.message), { code: error.code });
    }
    await logMarketing(g.auth, {
      acao: 'criar', entidade: 'custo', entidadeId: data.id, entidadeLabel: data.descricao,
      detalhes: { valor: data.valor, origem: 'requisicao', ref: String(reqId), via: 'tela_requisicao' },
    });
    return NextResponse.json({ item: data, acao });
  } catch (e) {
    return erroResposta(e, 'POST /custos/requisicao');
  }
}
