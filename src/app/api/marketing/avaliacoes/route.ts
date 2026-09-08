/* eslint-disable @typescript-eslint/no-explicit-any */
// Avaliação pós-evento. N avaliadores por ação (vendedor, marketing, diretoria)
// — por isso é tabela, não colunas na ação. Como tabela, a avaliação sobrevive
// à saída do responsável, que é exatamente o caso IRRIGASHOW.
//
// POST faz UPSERT: a mesma pessoa reabrindo o formulário edita a resposta dela,
// não cria uma segunda.
import { NextResponse } from 'next/server';
import { guardar, erroResposta, apenas, num } from '@/lib/marketing/rota';
import { db } from '@/lib/marketing/db';
import { logMarketing, nomeDoUsuario } from '@/lib/marketing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPOS = [
  'nota_geral', 'nota_publico', 'nota_estrutura', 'nota_equipe', 'nota_retorno',
  'funcionou', 'nao_funcionou', 'aprendizados', 'repetir',
] as const;

const NOTAS = ['nota_geral', 'nota_publico', 'nota_estrutura', 'nota_equipe', 'nota_retorno'];

export async function GET(req: Request) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;
  try {
    const acaoId = new URL(req.url).searchParams.get('acao_id');
    if (!acaoId) return NextResponse.json({ error: 'Informe acao_id' }, { status: 400 });
    const { data, error } = await db
      .from('mkt_avaliacoes').select('*').eq('acao_id', acaoId).order('criado_em');
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return NextResponse.json({ itens: data ?? [] });
  } catch (e) {
    return erroResposta(e, 'GET /avaliacoes');
  }
}

export async function POST(req: Request) {
  const g = await guardar(req, 'marketing', 'avaliacao:responder');
  if (g.resposta) return g.resposta;

  try {
    const body = await req.json();
    if (!body?.acao_id) return NextResponse.json({ error: 'Informe acao_id' }, { status: 400 });

    const dados: any = apenas(body, CAMPOS);
    for (const k of NOTAS) {
      if (k in dados) {
        const n = num(dados[k]);
        dados[k] = n === null ? null : Math.min(Math.max(Math.round(n), 1), 5);
      }
    }

    const avaliador = await nomeDoUsuario(g.auth);
    // A minha avaliação já existe? Então é edição, não uma segunda resposta.
    const { data: minha } = await db
      .from('mkt_avaliacoes')
      .select('id')
      .eq('acao_id', body.acao_id)
      .eq('avaliador_id', g.auth.userId)
      .maybeSingle();

    const payload = {
      ...dados,
      acao_id: body.acao_id,
      avaliador_id: g.auth.userId,
      avaliador_nome: avaliador,
      atualizado_em: new Date().toISOString(),
    };

    const q = minha
      ? db.from('mkt_avaliacoes').update(payload).eq('id', minha.id)
      : db.from('mkt_avaliacoes').insert([payload]);
    const { data, error } = await q.select('*').single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    await logMarketing(g.auth, {
      acao: minha ? 'editar' : 'criar',
      entidade: 'avaliacao',
      entidadeId: String(data.id),
      entidadeLabel: avaliador,
    });
    return NextResponse.json({ item: data });
  } catch (e) {
    return erroResposta(e, 'POST /avaliacoes');
  }
}
