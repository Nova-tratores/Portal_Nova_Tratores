/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Custos da ação — HÍBRIDOS: digitados à mão OU apontando pra um documento
// (Requisição / Conta a pagar / Nota de entrada), no idioma vinculo_tipo +
// vinculo_ref.
//
// `valor` é SNAPSHOT e autoritário. `valor_fonte` guarda o último valor lido da
// origem, só pra tela mostrar divergência. O total NUNCA se recalcula sozinho:
// senão o ROI de uma feira encerrada mudaria quando alguém edita uma requisição
// antiga meses depois.
// =============================================================================
import { NextResponse } from 'next/server';
import { guardar, erroResposta, apenas, num, dataOuNull } from '@/lib/marketing/rota';
import { db } from '@/lib/marketing/db';
import { logMarketing, nomeDoUsuario } from '@/lib/marketing/server';
import { VINCULOS_CUSTO } from '@/lib/marketing/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPOS = [
  'descricao', 'categoria', 'fornecedor', 'data',
  'vinculo_tipo', 'vinculo_ref', 'vinculo_label',
  'valor', 'valor_fonte', 'rateio_percent', 'status', 'observacoes', 'anexo_url',
] as const;

function normalizar(body: any) {
  const d: any = apenas(body, CAMPOS);
  for (const k of ['valor', 'valor_fonte', 'rateio_percent']) if (k in d) d[k] = num(d[k]);
  if ('data' in d) d.data = dataOuNull(d.data);

  // O CHECK do banco exige os dois nulos ou os dois preenchidos. Sem esta
  // normalização, um vínculo pela metade viraria erro 500 críptico na tela.
  if ('vinculo_tipo' in d || 'vinculo_ref' in d) {
    const tipo = d.vinculo_tipo ?? null;
    const ref = d.vinculo_ref === null || d.vinculo_ref === undefined ? null : String(d.vinculo_ref).trim() || null;
    if (!tipo || !ref) { d.vinculo_tipo = null; d.vinculo_ref = null; d.vinculo_label = null; }
    else { d.vinculo_tipo = tipo; d.vinculo_ref = ref; }
  }
  return d;
}

function vinculoValido(d: any): string | null {
  if (!d.vinculo_tipo) return null;
  if (!(VINCULOS_CUSTO as readonly string[]).includes(d.vinculo_tipo)) {
    return 'Tipo de vínculo inválido.';
  }
  return null;
}

export async function GET(req: Request) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;

  try {
    const url = new URL(req.url);
    const acaoId = url.searchParams.get('acao_id');

    if (acaoId) {
      const { data, error } = await db
        .from('mkt_custos').select('*').eq('acao_id', acaoId)
        .order('data', { nullsFirst: false }).order('criado_em');
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return NextResponse.json({ itens: data ?? [] });
    }

    // Consolidado de todas as ações (tela Investimento).
    const { data, error } = await db
      .from('mkt_custos').select('*').order('data', { nullsFirst: false }).limit(2000);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    const custos = data ?? [];
    const acaoIds = [...new Set(custos.map((c: any) => c.acao_id))];
    const acoes: Record<string, any> = {};
    if (acaoIds.length > 0) {
      const { data: as } = await db
        .from('mkt_acoes').select('id, nome, tipo, empresa, data_inicio, deleted_at').in('id', acaoIds);
      for (const a of as ?? []) acoes[a.id] = a;
    }
    const vivos = custos.filter((c: any) => acoes[c.acao_id] && !acoes[c.acao_id].deleted_at);
    return NextResponse.json({ itens: vivos, acoes });
  } catch (e) {
    return erroResposta(e, 'GET /custos');
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  // Vincular documento é permissão à parte de digitar um custo: quem lança a
  // despesa da feira não necessariamente pode amarrar títulos do financeiro.
  const acaoPerm = body?.vinculo_tipo ? 'custos:vincular' : 'custos:editar';
  const g = await guardar(req, 'marketing', acaoPerm);
  if (g.resposta) return g.resposta;

  try {
    if (!body?.acao_id) return NextResponse.json({ error: 'Informe acao_id' }, { status: 400 });
    const dados = normalizar(body);
    if (!dados.descricao || !String(dados.descricao).trim()) {
      return NextResponse.json({ error: 'Descreva o custo' }, { status: 400 });
    }
    const problema = vinculoValido(dados);
    if (problema) return NextResponse.json({ error: problema }, { status: 400 });

    const autor = await nomeDoUsuario(g.auth);
    const { data, error } = await db
      .from('mkt_custos')
      .insert([{
        ...dados,
        acao_id: body.acao_id,
        sincronizado_em: dados.valor_fonte !== null && dados.valor_fonte !== undefined ? new Date().toISOString() : null,
        criado_por_id: g.auth.userId,
        criado_por_nome: autor,
      }])
      .select('*')
      .single();

    if (error) {
      // O índice único impede o mesmo documento entrar duas vezes na mesma ação.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Este documento já está lançado nesta ação.' },
          { status: 409 },
        );
      }
      throw Object.assign(new Error(error.message), { code: error.code });
    }

    await logMarketing(g.auth, {
      acao: 'criar',
      entidade: 'custo',
      entidadeId: data.id,
      entidadeLabel: data.descricao,
      detalhes: { valor: data.valor, origem: data.origem, ref: data.vinculo_ref },
    });
    return NextResponse.json({ item: data });
  } catch (e) {
    return erroResposta(e, 'POST /custos');
  }
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const acaoPerm = body?.vinculo_tipo ? 'custos:vincular' : 'custos:editar';
  const g = await guardar(req, 'marketing', acaoPerm);
  if (g.resposta) return g.resposta;

  try {
    if (!body?.id) return NextResponse.json({ error: 'Informe o id' }, { status: 400 });
    const dados = normalizar(body);
    if (Object.keys(dados).length === 0) {
      return NextResponse.json({ error: 'Nada para alterar' }, { status: 400 });
    }
    const problema = vinculoValido(dados);
    if (problema) return NextResponse.json({ error: problema }, { status: 400 });

    const { data, error } = await db
      .from('mkt_custos')
      .update({ ...dados, atualizado_em: new Date().toISOString() })
      .eq('id', body.id)
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Este documento já está lançado nesta ação.' }, { status: 409 });
      }
      throw Object.assign(new Error(error.message), { code: error.code });
    }

    await logMarketing(g.auth, {
      acao: 'editar',
      entidade: 'custo',
      entidadeId: String(body.id),
      entidadeLabel: data.descricao,
      detalhes: { campos: Object.keys(dados), valor: data.valor },
    });
    return NextResponse.json({ item: data });
  } catch (e) {
    return erroResposta(e, 'PATCH /custos');
  }
}

export async function DELETE(req: Request) {
  const g = await guardar(req, 'marketing', 'custos:editar');
  if (g.resposta) return g.resposta;

  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Informe o id' }, { status: 400 });
    const { error } = await db.from('mkt_custos').delete().eq('id', id);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    await logMarketing(g.auth, { acao: 'excluir', entidade: 'custo', entidadeId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroResposta(e, 'DELETE /custos');
  }
}
