/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Administração dos links do questionário (dentro do módulo, COM login).
//
// GET    ?acao_id=   -> links da ação, com respostas e progresso
// POST               -> cria link e devolve o token
// PATCH              -> fecha / reabre
// DELETE ?id=        -> apaga o link (e as respostas, por cascade)
// =============================================================================
import { NextResponse } from 'next/server';
import { guardar, erroResposta, dataOuNull } from '@/lib/marketing/rota';
import { criarLink, listarLinks, definirEditavel, excluirLink } from '@/lib/marketing/questionario-db';
import { logMarketing, nomeDoUsuario } from '@/lib/marketing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;
  try {
    const acaoId = new URL(req.url).searchParams.get('acao_id');
    if (!acaoId) return NextResponse.json({ error: 'Informe acao_id' }, { status: 400 });
    return NextResponse.json({ links: await listarLinks(acaoId) });
  } catch (e) {
    return erroResposta(e, 'GET /questionario');
  }
}

export async function POST(req: Request) {
  // Gerar link é dar acesso de escrita a quem não tem login — por isso vale a
  // mesma permissão de editar a ação, não a de só olhar.
  const g = await guardar(req, 'marketing', 'acoes:editar');
  if (g.resposta) return g.resposta;

  try {
    const body = await req.json();
    if (!body?.acao_id) return NextResponse.json({ error: 'Informe a ação' }, { status: 400 });
    if (!body?.destinatario_nome && !body?.destinatario_usuario_id) {
      return NextResponse.json({ error: 'Escolha para quem é o link' }, { status: 400 });
    }

    const autor = await nomeDoUsuario(g.auth);
    const link = await criarLink({
      acaoId: body.acao_id,
      destinatarioUsuarioId: body.destinatario_usuario_id || null,
      destinatarioNome: body.destinatario_nome || null,
      destinatarioEmail: body.destinatario_email || null,
      expiraEm: dataOuNull(body.expira_em),
      titulo: body.titulo || null,
      criadoPorId: g.auth.userId,
      criadoPorNome: autor,
    });

    await logMarketing(g.auth, {
      acao: 'criar',
      entidade: 'questionario_link',
      entidadeId: link.id,
      entidadeLabel: link.destinatario_nome ?? undefined,
      detalhes: { acao_id: body.acao_id, expira_em: link.expira_em },
    });

    return NextResponse.json({ link });
  } catch (e) {
    return erroResposta(e, 'POST /questionario');
  }
}

export async function PATCH(req: Request) {
  const g = await guardar(req, 'marketing', 'acoes:editar');
  if (g.resposta) return g.resposta;

  try {
    const body = await req.json();
    if (!body?.id) return NextResponse.json({ error: 'Informe o link' }, { status: 400 });
    if (typeof body.editavel !== 'boolean') {
      return NextResponse.json({ error: 'Informe se o link fica editável' }, { status: 400 });
    }

    const link = await definirEditavel(body.id, body.editavel);
    await logMarketing(g.auth, {
      acao: body.editavel ? 'reabrir' : 'fechar',
      entidade: 'questionario_link',
      entidadeId: String(body.id),
    });
    return NextResponse.json({ link });
  } catch (e) {
    return erroResposta(e, 'PATCH /questionario');
  }
}

export async function DELETE(req: Request) {
  const g = await guardar(req, 'marketing', 'acoes:excluir');
  if (g.resposta) return g.resposta;

  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Informe o link' }, { status: 400 });
    await excluirLink(id);
    await logMarketing(g.auth, { acao: 'excluir', entidade: 'questionario_link', entidadeId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroResposta(e, 'DELETE /questionario');
  }
}
