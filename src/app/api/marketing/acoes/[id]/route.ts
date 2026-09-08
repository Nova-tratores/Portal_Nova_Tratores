/* eslint-disable @typescript-eslint/no-explicit-any */
// GET    /api/marketing/acoes/[id]  — ficha COMPLETA (uma chamada abre a tela)
// PATCH  /api/marketing/acoes/[id]  — edita
// DELETE /api/marketing/acoes/[id]  — lixeira (soft delete); ?restaurar=1 volta
import { NextResponse } from 'next/server';
import { guardar, erroResposta, apenas, num, dataOuNull } from '@/lib/marketing/rota';
import { db, carregarAcaoCompleta, idsInativos } from '@/lib/marketing/db';
import { logMarketing } from '@/lib/marketing/server';
import { calcularROI } from '@/lib/marketing/roi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPOS = [
  'codigo', 'nome', 'tipo', 'status', 'empresa', 'descricao', 'objetivo',
  'data_inicio', 'data_fim', 'local_nome', 'cidade', 'uf',
  'projeto_codigo', 'projeto_nome', 'projeto_empresa',
  'orcamento_previsto', 'meta_leads', 'meta_vendas', 'meta_receita',
  'responsavel_id', 'responsavel_nome', 'responsavel_email',
  'publico_estimado', 'observacoes',
] as const;

function normalizar(body: any) {
  const dados: any = apenas(body, CAMPOS);
  for (const k of ['projeto_codigo', 'orcamento_previsto', 'meta_leads', 'meta_vendas', 'meta_receita', 'publico_estimado']) {
    if (k in dados) dados[k] = num(dados[k]);
  }
  for (const k of ['data_inicio', 'data_fim']) {
    if (k in dados) dados[k] = dataOuNull(dados[k]);
  }
  if (typeof dados.uf === 'string') dados.uf = dados.uf.toUpperCase().slice(0, 2) || null;
  return dados;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;

  try {
    const { id } = await ctx.params;
    const ficha = await carregarAcaoCompleta(id);
    if (!ficha) return NextResponse.json({ error: 'Ação não encontrada' }, { status: 404 });

    // Responsável que saiu da empresa — a ficha precisa avisar "reatribuir".
    const inativos = await idsInativos([
      ficha.acao.responsavel_id,
      ...ficha.apoios.map((a) => a.responsavel_id),
    ]);

    const roi = calcularROI({
      acao: ficha.acao,
      custos: ficha.custos,
      apoios: ficha.apoios,
      leads: ficha.leads,
      propostas: ficha.propostas,
    });

    return NextResponse.json({ ...ficha, roi, inativos: [...inativos] });
  } catch (e) {
    return erroResposta(e, 'GET /acoes/[id]');
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardar(req, 'marketing', 'acoes:editar');
  if (g.resposta) return g.resposta;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const dados = normalizar(body);
    if ('nome' in dados && !String(dados.nome || '').trim()) {
      return NextResponse.json({ error: 'Informe o nome da ação' }, { status: 400 });
    }
    if (Object.keys(dados).length === 0) {
      return NextResponse.json({ error: 'Nada para alterar' }, { status: 400 });
    }

    const { data, error } = await db
      .from('mkt_acoes')
      .update({ ...dados, atualizado_em: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    await logMarketing(g.auth, {
      acao: 'editar',
      entidade: 'acao',
      entidadeId: id,
      entidadeLabel: data.nome,
      detalhes: { campos: Object.keys(dados) },
    });

    return NextResponse.json({ acao: data });
  } catch (e) {
    return erroResposta(e, 'PATCH /acoes/[id]');
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardar(req, 'marketing', 'acoes:excluir');
  if (g.resposta) return g.resposta;

  try {
    const { id } = await ctx.params;
    const restaurar = new URL(req.url).searchParams.get('restaurar') === '1';

    // Lixeira, nunca DELETE de verdade: o histórico de um evento é o que sobra
    // quando o responsável sai da empresa.
    const { data, error } = await db
      .from('mkt_acoes')
      .update({ deleted_at: restaurar ? null : new Date().toISOString(), atualizado_em: new Date().toISOString() })
      .eq('id', id)
      .select('id, nome')
      .single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    await logMarketing(g.auth, {
      acao: restaurar ? 'restaurar' : 'excluir',
      entidade: 'acao',
      entidadeId: id,
      entidadeLabel: data.nome,
    });

    return NextResponse.json({ ok: true, restaurada: restaurar });
  } catch (e) {
    return erroResposta(e, 'DELETE /acoes/[id]');
  }
}
