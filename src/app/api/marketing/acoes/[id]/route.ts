/* eslint-disable @typescript-eslint/no-explicit-any */
// GET    /api/marketing/acoes/[id]  — ficha COMPLETA (uma chamada abre a tela)
// PATCH  /api/marketing/acoes/[id]  — edita
// DELETE /api/marketing/acoes/[id]  — lixeira (soft delete); ?restaurar=1 volta
import { NextResponse } from 'next/server';
import { guardar, erroResposta, apenas, num, dataOuNull } from '@/lib/marketing/rota';
import { db, carregarAcaoCompleta, idsInativos, roletasDas, obterRegrasRetorno } from '@/lib/marketing/db';
import { logMarketing } from '@/lib/marketing/server';
import { calcularROI } from '@/lib/marketing/roi';
import { exigeResponsavel } from '@/lib/marketing/tipos';
import { acessoDaCampanha, salvarResponsaveis } from '@/lib/marketing/acesso';

/** 25/11/2026: campanha privada sem acesso → 403 mudo (não diz nem o nome). */
const SEM_ACESSO = () => NextResponse.json({ error: 'Campanha privada: você não tem acesso.', privada: true }, { status: 403 });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPOS = [
  'codigo', 'nome', 'tipo', 'status', 'empresa', 'descricao', 'objetivo',
  'data_inicio', 'data_fim', 'local_nome', 'cidade', 'uf',
  'projeto_codigo', 'projeto_nome', 'projeto_empresa',
  'orcamento_previsto', 'meta_leads', 'meta_vendas', 'meta_receita',
  'responsavel_id', 'responsavel_nome', 'responsavel_email',
  'publico_estimado', 'publico_total_evento', 'dias_participacao', 'stand_descricao',
  'leads_declarados', 'observacoes', 'capa_url', 'visibilidade',
] as const;

function normalizar(body: any) {
  const dados: any = apenas(body, CAMPOS);
  if ('visibilidade' in dados) dados.visibilidade = dados.visibilidade === 'privada' ? 'privada' : 'publica';
  for (const k of ['projeto_codigo', 'orcamento_previsto', 'meta_leads', 'meta_vendas',
                   'meta_receita', 'publico_estimado', 'publico_total_evento',
                   'dias_participacao', 'leads_declarados']) {
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
    const acesso = await acessoDaCampanha(g.auth, id);
    if (acesso.existe && !acesso.ver) return SEM_ACESSO();
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
      regras: await obterRegrasRetorno(),
    });

    const roleta = (await roletasDas([id]))[id] ?? null;
    // quantos giraram a roleta — entra no funil do Resumo (revisão da tela, 23/11/2026)
    if (roleta) {
      const { data: camp } = await db.from('campanhas').select('id').eq('acao_id', id).limit(1).maybeSingle();
      if (camp) {
        const { count } = await db.from('campanha_participacoes').select('id', { count: 'exact', head: true }).eq('campanha_id', camp.id);
        roleta.participantes = count ?? 0;
      }
    }

    return NextResponse.json({ ...ficha, roi, inativos: [...inativos], roleta, responsaveis: acesso.responsaveis, souResponsavel: acesso.responsavel });
  } catch (e) {
    return erroResposta(e, 'GET /acoes/[id]');
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardar(req, 'marketing', 'acoes:editar');
  if (g.resposta) return g.resposta;

  try {
    const { id } = await ctx.params;
    const acesso = await acessoDaCampanha(g.auth, id);
    if (acesso.existe && !acesso.ver) return SEM_ACESSO();
    const body = await req.json();
    const dados = normalizar(body);
    if ('nome' in dados && !String(dados.nome || '').trim()) {
      return NextResponse.json({ error: 'Informe o nome da ação' }, { status: 400 });
    }
    // 25/11/2026: o grupo de responsáveis vem junto no "Editar campanha" (o dono sempre entra)
    let responsaveis: any[] | undefined;
    if (Array.isArray(body.responsaveis)) {
      const dono = 'responsavel_id' in dados ? dados.responsavel_id : (await db.from('mkt_acoes').select('responsavel_id').eq('id', id).maybeSingle()).data?.responsavel_id;
      responsaveis = await salvarResponsaveis(id, [...body.responsaveis.map(String), dono].filter(Boolean), g.auth.userId);
      if (Object.keys(dados).length === 0) return NextResponse.json({ responsaveis });
    }
    if (Object.keys(dados).length === 0) {
      return NextResponse.json({ error: 'Nada para alterar' }, { status: 400 });
    }
    // Fase 2 (23/11/2026): aprovada / em andamento precisa de dono — as duas campanhas estavam sem responsável
    if ('status' in dados || 'responsavel_id' in dados) {
      const { data: atual } = await db.from('mkt_acoes').select('status, responsavel_id').eq('id', id).maybeSingle();
      const status = 'status' in dados ? dados.status : atual?.status;
      const resp = 'responsavel_id' in dados ? dados.responsavel_id : atual?.responsavel_id;
      const msg = exigeResponsavel(status, resp);
      if (msg) return NextResponse.json({ error: msg }, { status: 400 });
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

    return NextResponse.json({ acao: data, responsaveis });
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
