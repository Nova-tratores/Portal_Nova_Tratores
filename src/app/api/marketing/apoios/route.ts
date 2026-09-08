/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Apoio de fábrica (verba co-op) — o item de maior valor do módulo: é dinheiro
// a receber, com prazo e processo documental próprios.
//
// GET   ?acao_id=  -> apoios de uma ação
// GET   (sem acao_id) -> CARTEIRA: todos os apoios em aberto, com a ação junto
// POST  cria
// PATCH edita (mudança de status vai pro audit_log com o antes e o depois)
// =============================================================================
import { NextResponse } from 'next/server';
import { guardar, erroResposta, apenas, num, dataOuNull } from '@/lib/marketing/rota';
import { db, idsInativos } from '@/lib/marketing/db';
import { logMarketing } from '@/lib/marketing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPOS = [
  'apoiador', 'tipo', 'descricao',
  'valor_previsto', 'valor_aprovado', 'valor_recebido', 'status',
  'processo_numero', 'documento_tipo', 'documento_numero', 'documento_emitido_em',
  'documento_url', 'previsao_credito', 'credito_em', 'forma_credito',
  'contrapartida_texto', 'contrapartida_prazo', 'relatorio_status',
  'responsavel_id', 'responsavel_nome', 'observacoes',
] as const;

const NUMERICOS = ['valor_previsto', 'valor_aprovado', 'valor_recebido'];
const DATAS = ['documento_emitido_em', 'previsao_credito', 'credito_em', 'contrapartida_prazo'];

function normalizar(body: any) {
  const dados: any = apenas(body, CAMPOS);
  for (const k of NUMERICOS) if (k in dados) dados[k] = num(dados[k]);
  for (const k of DATAS) if (k in dados) dados[k] = dataOuNull(dados[k]);
  return dados;
}

export async function GET(req: Request) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;

  try {
    const url = new URL(req.url);
    const acaoId = url.searchParams.get('acao_id');

    if (acaoId) {
      const { data, error } = await db
        .from('mkt_apoios').select('*').eq('acao_id', acaoId).order('criado_em');
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      const inativos = await idsInativos((data ?? []).map((a: any) => a.responsavel_id));
      return NextResponse.json({ itens: data ?? [], inativos: [...inativos] });
    }

    // CARTEIRA consolidada: o que a empresa tem a receber e o que deve entregar.
    // `somenteAbertos` é o padrão — o que já foi recebido e aceito não é fila.
    const todos = url.searchParams.get('todos') === '1';
    let q = db.from('mkt_apoios').select('*');
    if (!todos) q = q.not('status', 'in', '("recusado","cancelado")');
    const { data, error } = await q.order('contrapartida_prazo', { nullsFirst: false });
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    const apoios = data ?? [];
    const acaoIds = [...new Set(apoios.map((a: any) => a.acao_id))];
    const acoes: Record<string, any> = {};
    if (acaoIds.length > 0) {
      const { data: as } = await db
        .from('mkt_acoes')
        .select('id, nome, tipo, empresa, data_inicio, data_fim, deleted_at, responsavel_nome, responsavel_id')
        .in('id', acaoIds);
      for (const a of as ?? []) acoes[a.id] = a;
    }
    // Apoio de ação na lixeira não é cobrança viva.
    const vivos = apoios.filter((a: any) => acoes[a.acao_id] && !acoes[a.acao_id].deleted_at);
    const inativos = await idsInativos([
      ...vivos.map((a: any) => a.responsavel_id),
      ...Object.values(acoes).map((a: any) => a.responsavel_id),
    ]);

    return NextResponse.json({ itens: vivos, acoes, inativos: [...inativos] });
  } catch (e) {
    return erroResposta(e, 'GET /apoios');
  }
}

export async function POST(req: Request) {
  const g = await guardar(req, 'marketing', 'apoios:editar');
  if (g.resposta) return g.resposta;

  try {
    const body = await req.json();
    if (!body?.acao_id) return NextResponse.json({ error: 'Informe acao_id' }, { status: 400 });
    const dados = normalizar(body);
    if (!dados.apoiador || !String(dados.apoiador).trim()) {
      return NextResponse.json({ error: 'Informe quem está apoiando (ex.: Mahindra)' }, { status: 400 });
    }

    const { data, error } = await db
      .from('mkt_apoios')
      .insert([{ ...dados, acao_id: body.acao_id }])
      .select('*')
      .single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    await logMarketing(g.auth, {
      acao: 'criar',
      entidade: 'apoio',
      entidadeId: data.id,
      entidadeLabel: `${data.apoiador} — ${data.acao_id}`,
      detalhes: { valor_previsto: data.valor_previsto, status: data.status },
    });
    return NextResponse.json({ item: data });
  } catch (e) {
    return erroResposta(e, 'POST /apoios');
  }
}

export async function PATCH(req: Request) {
  const g = await guardar(req, 'marketing', 'apoios:editar');
  if (g.resposta) return g.resposta;

  try {
    const body = await req.json();
    if (!body?.id) return NextResponse.json({ error: 'Informe o id do apoio' }, { status: 400 });
    const dados = normalizar(body);
    if (Object.keys(dados).length === 0) {
      return NextResponse.json({ error: 'Nada para alterar' }, { status: 400 });
    }

    // Guarda o estado anterior: mudança de status de apoio é dinheiro andando,
    // e o audit_log tem que registrar de onde pra onde.
    const { data: antes } = await db
      .from('mkt_apoios').select('status, relatorio_status, valor_recebido, apoiador').eq('id', body.id).maybeSingle();

    const { data, error } = await db
      .from('mkt_apoios')
      .update({ ...dados, atualizado_em: new Date().toISOString() })
      .eq('id', body.id)
      .select('*')
      .single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    const mudouStatus = antes && dados.status && antes.status !== dados.status;
    await logMarketing(g.auth, {
      acao: mudouStatus ? 'mover_status' : 'editar',
      entidade: 'apoio',
      entidadeId: String(body.id),
      entidadeLabel: data.apoiador,
      detalhes: mudouStatus
        ? { de: antes!.status, para: dados.status, valor_recebido: data.valor_recebido }
        : { campos: Object.keys(dados) },
    });

    return NextResponse.json({ item: data });
  } catch (e) {
    return erroResposta(e, 'PATCH /apoios');
  }
}

export async function DELETE(req: Request) {
  const g = await guardar(req, 'marketing', 'apoios:editar');
  if (g.resposta) return g.resposta;

  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Informe o id' }, { status: 400 });
    const { error } = await db.from('mkt_apoios').delete().eq('id', id);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    await logMarketing(g.auth, { acao: 'excluir', entidade: 'apoio', entidadeId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroResposta(e, 'DELETE /apoios');
  }
}
