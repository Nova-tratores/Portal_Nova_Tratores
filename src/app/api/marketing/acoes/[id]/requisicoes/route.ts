/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// GET  /api/marketing/acoes/[id]/requisicoes — as requisições da campanha (grupo + ligadas como custo),
//      com fase, valor, comentários e os responsáveis. Também lança/atualiza os custos sozinho
//      (ver lib/marketing/reqs-da-campanha.ts) e devolve `mudou` para a tela recarregar o Investimento.
// POST /api/marketing/acoes/[id]/requisicoes — comentário numa requisição da campanha.
//      { req_id, texto, mencoes?: uuid[], atribuir?: { user_id, prazo? } }
//      @marcados recebem notificação; "atribuir" vira um PEDIDO na fila da pessoa (ticket), ligado à requisição.
// 25/11/2026 (José). Só quem enxerga a campanha (pública, responsável ou dev).
// =============================================================================
import { NextResponse } from 'next/server';
import { guardar, erroResposta, dataOuNull } from '@/lib/marketing/rota';
import { db } from '@/lib/marketing/db';
import { nomeDoUsuario, logMarketing } from '@/lib/marketing/server';
import { acessoDaCampanha } from '@/lib/marketing/acesso';
import { reqsDaCampanha, FASES_REQ } from '@/lib/marketing/reqs-da-campanha';
import { garantirParticipante, registrarEvento, notificarTicket } from '@/lib/tickets/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEM_ACESSO = () => NextResponse.json({ error: 'Campanha privada: você não tem acesso.', privada: true }, { status: 403 });
const semTabela = (e: any) => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(String(e.message || '')));

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;
  try {
    const { id } = await ctx.params;
    const acesso = await acessoDaCampanha(g.auth, id);
    if (!acesso.existe) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
    if (!acesso.ver) return SEM_ACESSO();

    const autor = await nomeDoUsuario(g.auth);
    const { reqs, grupoId, mudou } = await reqsDaCampanha(id, { id: g.auth.userId, nome: autor });

    // comentários (se o SQL novo ainda não rodou, a lista vem vazia e o resto funciona)
    let comentarios: any[] = [];
    let semSql = false;
    if (reqs.length) {
      const { data, error } = await db.from('mkt_req_comentarios')
        .select('id, req_id, autor_id, autor_nome, texto, mencoes, ticket_id, criado_em')
        .eq('acao_id', id).in('req_id', reqs.map((r) => r.id)).order('criado_em');
      if (error) { if (semTabela(error)) semSql = true; else throw error; }
      comentarios = data ?? [];
    }
    // situação dos pedidos atribuídos (para mostrar "feito" / "em andamento")
    const tIds = comentarios.map((c) => c.ticket_id).filter(Boolean);
    const tickets: Record<string, any> = {};
    if (tIds.length) {
      const { data } = await db.from('tickets').select('id, numero, status, responsavel_id, prazo').in('id', tIds);
      for (const t of data ?? []) tickets[t.id] = t;
    }

    // responsáveis com nome e rosto (o seletor de @ e de "atribuir" usa só eles)
    const ids = [...new Set(acesso.responsaveis.map((r) => r.user_id))];
    const { data: pessoas } = ids.length ? await db.from('financeiro_usu').select('id, nome, avatar_url').in('id', ids) : { data: [] as any[] };

    return NextResponse.json({
      reqs, fases: FASES_REQ, grupoId, mudou, semSql,
      comentarios: comentarios.map((c) => ({ ...c, ticket: c.ticket_id ? tickets[c.ticket_id] ?? null : null })),
      responsaveis: pessoas ?? [],
    });
  } catch (e) {
    return erroResposta(e, 'GET /acoes/[id]/requisicoes');
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;
  try {
    const { id } = await ctx.params;
    const acesso = await acessoDaCampanha(g.auth, id);
    if (!acesso.existe) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
    if (!acesso.ver) return SEM_ACESSO();

    const body = await req.json();
    const reqId = Number(body.req_id);
    const texto = String(body.texto || '').trim().slice(0, 4000);
    if (!Number.isInteger(reqId) || reqId <= 0) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
    if (!texto) return NextResponse.json({ error: 'Escreva o comentário' }, { status: 400 });

    const { data: acao } = await db.from('mkt_acoes').select('id, nome').eq('id', id).maybeSingle();
    const { data: rq } = await db.from('Requisicao').select('id, titulo').eq('id', reqId).maybeSingle();
    if (!rq) return NextResponse.json({ error: 'Requisição não encontrada' }, { status: 404 });

    // @ e atribuição: só para os responsáveis da campanha
    const permitidos = new Set(acesso.responsaveis.map((r) => r.user_id));
    const brutos: string[] = Array.isArray(body.mencoes) ? body.mencoes.map(String) : [];
    const mencoes: string[] = [...new Set(brutos)].filter((u) => permitidos.has(u));
    const para = body.atribuir?.user_id ? String(body.atribuir.user_id) : null;
    if (para && !permitidos.has(para)) return NextResponse.json({ error: 'Só dá para atribuir a um responsável da campanha.' }, { status: 400 });

    const autor = await nomeDoUsuario(g.auth);
    const rotuloReq = `#${rq.id} ${rq.titulo || 'Requisição'}`;
    const link = `/marketing/${id}?req=${rq.id}`;

    // atribuição → pedido na fila da pessoa (mesmo molde das ações de reunião: nasce aceito, com vínculo à requisição)
    let ticket: any = null;
    if (para) {
      const prazo = dataOuNull(body.atribuir?.prazo);
      const { data: t, error: eT } = await db.from('tickets').insert({
        tipo: 'generico', titulo: texto.slice(0, 140), categoria: 'Marketing',
        descricao: `Campanha "${acao?.nome ?? ''}" · Requisição ${rotuloReq}\n\n${texto}`,
        prazo, visibilidade: 'privado', solicitante_id: g.auth.userId, responsavel_id: para, aceite: 'ok',
        payload: { origem: 'marketing', mkt_acao_id: id, campanha: acao?.nome ?? null, req_id: rq.id },
      }).select('*').single();
      if (eT) throw eT;
      ticket = t;
      await garantirParticipante(t.id, g.auth.userId, g.auth.userId);
      await garantirParticipante(t.id, para, g.auth.userId);
      await db.from('tickets_vinculos').insert({ ticket_id: t.id, vinculo_tipo: 'requisicao', vinculo_ref: String(rq.id), vinculo_label: rotuloReq, criado_por: g.auth.userId });
      await registrarEvento(t.id, g.auth.userId, 'criacao', { titulo: t.titulo, responsavel_id: para, origem: 'marketing', mkt_acao_id: id, req_id: rq.id });
      await notificarTicket(t, [para], g.auth.userId, `Tarefa na campanha ${acao?.nome ?? ''}: #${t.numero}`,
        `${autor} te passou: ${texto.slice(0, 120)}${prazo ? ` · até ${prazo.split('-').reverse().join('/')}` : ''}`, 'tarefa_nova');
    }

    const { data: com, error } = await db.from('mkt_req_comentarios').insert({
      acao_id: id, req_id: rq.id, autor_id: g.auth.userId, autor_nome: autor, texto,
      mencoes: [...new Set([...mencoes, ...(para ? [para] : [])])], ticket_id: ticket?.id ?? null,
    }).select('*').single();
    if (error) throw error;

    // @marcados (menos quem escreveu e menos quem já recebeu o aviso da tarefa) → sininho + push
    const avisar = mencoes.filter((u) => u !== g.auth.userId && u !== para);
    if (avisar.length) {
      await db.from('portal_notificacoes').insert(avisar.map((user_id) => ({
        user_id, tipo: 'marketing', titulo: `${autor} te marcou na campanha ${acao?.nome ?? ''}`,
        descricao: `${rotuloReq}: ${texto.slice(0, 140)}`, link,
      })));
    }

    await logMarketing(g.auth, { acao: para ? 'atribuir' : 'comentar', entidade: 'acao', entidadeId: id, entidadeLabel: acao?.nome ?? id, detalhes: { req_id: rq.id, ticket: ticket?.numero ?? null, mencoes: avisar.length } });
    return NextResponse.json({ comentario: { ...com, ticket: ticket ? { id: ticket.id, numero: ticket.numero, status: ticket.status, responsavel_id: para, prazo: ticket.prazo } : null } });
  } catch (e) {
    return erroResposta(e, 'POST /acoes/[id]/requisicoes');
  }
}
