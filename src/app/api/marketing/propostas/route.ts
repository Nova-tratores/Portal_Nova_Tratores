/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Vínculo proposta <-> ação de marketing.
//
// ⚠️ NADA é escrito no módulo Comercial. A ligação mora em mkt_acao_propostas.
// Não existe (e não pode existir) coluna evento_id em "Formulario": a view
// v_formulario foi criada com `SELECT f.*`, o Postgres expande o * na criação,
// e a coluna nova não apareceria na view — que é justamente o que a tela
// /propostas lê. Ver sql/propostas-tags.sql, linhas 8-13.
//
// GET    ?acao_id=      -> propostas já vinculadas
// GET    ?q=            -> busca em v_formulario pra vincular
// POST                  -> vincula (aceita `peso` pra atribuição parcial)
// DELETE ?acao_id=&proposta_id= -> desvincula
// =============================================================================
import { NextResponse } from 'next/server';
import { guardar, erroResposta, num } from '@/lib/marketing/rota';
import { db, propostasDaAcao, normalizar } from '@/lib/marketing/db';
import { logMarketing, nomeDoUsuario } from '@/lib/marketing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;

  try {
    const url = new URL(req.url);
    const acaoId = url.searchParams.get('acao_id');
    const termo = (url.searchParams.get('q') || '').trim();

    if (termo) {
      // Busca pra vincular. Filtra em JS por causa do acento (o ilike do
      // Postgres não ignora) — o volume de propostas é pequeno.
      const { data, error } = await db
        .from('v_formulario')
        .select('id, "Cliente", "Cidade", "Modelo", "Valor_Total", status, vendedor_nome, criado_em, deleted_at')
        .is('deleted_at', null)
        .order('criado_em', { ascending: false })
        .limit(400);
      if (error) throw Object.assign(new Error(error.message), { code: error.code });

      const alvo = normalizar(termo);
      const achados = (data ?? []).filter((p: any) =>
        normalizar(`${p.Cliente ?? ''} ${p.Modelo ?? ''} ${p.Cidade ?? ''} ${p.id}`).includes(alvo),
      );
      return NextResponse.json({ propostas: achados.slice(0, 25) });
    }

    if (!acaoId) return NextResponse.json({ error: 'Informe acao_id ou q' }, { status: 400 });
    return NextResponse.json({ itens: await propostasDaAcao(acaoId) });
  } catch (e) {
    return erroResposta(e, 'GET /propostas');
  }
}

export async function POST(req: Request) {
  const g = await guardar(req, 'marketing', 'propostas:vincular');
  if (g.resposta) return g.resposta;

  try {
    const body = await req.json();
    if (!body?.acao_id || !body?.proposta_id) {
      return NextResponse.json({ error: 'Informe a ação e a proposta' }, { status: 400 });
    }
    // Peso permite atribuição parcial: a proposta que nasceu na feira mas
    // fechou depois de uma ação de loja não pode contar 100% nas duas.
    const peso = num(body.peso);
    const autor = await nomeDoUsuario(g.auth);

    const { data, error } = await db
      .from('mkt_acao_propostas')
      .insert([{
        acao_id: body.acao_id,
        proposta_id: Number(body.proposta_id),
        lead_id: body.lead_id || null,
        origem: body.lead_id ? 'lead' : 'manual',
        peso: peso && peso > 0 && peso <= 1 ? peso : 1,
        observacao: body.observacao || null,
        criado_por_id: g.auth.userId,
        criado_por_nome: autor,
      }])
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Esta proposta já está vinculada a esta ação.' }, { status: 409 });
      }
      if (error.code === '23503') {
        return NextResponse.json({ error: 'Proposta não encontrada no Comercial.' }, { status: 404 });
      }
      throw Object.assign(new Error(error.message), { code: error.code });
    }

    await logMarketing(g.auth, {
      acao: 'vincular',
      entidade: 'proposta',
      entidadeId: String(body.proposta_id),
      detalhes: { acao_id: body.acao_id, peso: data.peso },
    });
    return NextResponse.json({ item: data });
  } catch (e) {
    return erroResposta(e, 'POST /propostas');
  }
}

export async function PATCH(req: Request) {
  const g = await guardar(req, 'marketing', 'propostas:vincular');
  if (g.resposta) return g.resposta;

  try {
    const body = await req.json();
    if (!body?.acao_id || !body?.proposta_id) {
      return NextResponse.json({ error: 'Informe a ação e a proposta' }, { status: 400 });
    }
    const peso = num(body.peso);
    if (peso === null || peso <= 0 || peso > 1) {
      return NextResponse.json({ error: 'O peso vai de 0 a 1 (1 = a ação leva o crédito inteiro).' }, { status: 400 });
    }

    const { data, error } = await db
      .from('mkt_acao_propostas')
      .update({ peso, observacao: body.observacao ?? null })
      .eq('acao_id', body.acao_id)
      .eq('proposta_id', Number(body.proposta_id))
      .select('*')
      .single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    return NextResponse.json({ item: data });
  } catch (e) {
    return erroResposta(e, 'PATCH /propostas');
  }
}

export async function DELETE(req: Request) {
  const g = await guardar(req, 'marketing', 'propostas:vincular');
  if (g.resposta) return g.resposta;

  try {
    const url = new URL(req.url);
    const acaoId = url.searchParams.get('acao_id');
    const propostaId = url.searchParams.get('proposta_id');
    if (!acaoId || !propostaId) {
      return NextResponse.json({ error: 'Informe a ação e a proposta' }, { status: 400 });
    }

    const { error } = await db
      .from('mkt_acao_propostas')
      .delete()
      .eq('acao_id', acaoId)
      .eq('proposta_id', Number(propostaId));
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    await logMarketing(g.auth, {
      acao: 'desvincular',
      entidade: 'proposta',
      entidadeId: propostaId,
      detalhes: { acao_id: acaoId },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroResposta(e, 'DELETE /propostas');
  }
}
