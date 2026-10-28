// /api/inteligencia-vendas/feed — feed do vendedor no app de vendas.
//   GET              resumo das reservas gravadas (quantos contatos por vendedor, quando)
//   POST {acao:'gerar'}  monta e grava agora (admin ou quem tem o módulo inteiro)
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { erroIV, guardarIV, logIV, migracaoFaltando } from '@/lib/inteligencia-vendas/server';
import { gerarFeeds } from '@/lib/inteligencia-vendas/feed-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const MIGRACAO = 'Migration sql/inteligencia-vendas-feed.sql não aplicada';

export async function GET(req: Request) {
  const g = await guardarIV(req);
  if (g.resposta) return g.resposta;
  try {
    const [{ data, error }, { data: perfis }, { data: vends }] = await Promise.all([
      supabaseAdmin.from('iv_feed_pool').select('vendedor_id,gerado_em,cidades,itens'),
      supabaseAdmin.from('iv_perfil_vendedor').select('vendedor_id,perfil,mix,feito_em'),
      supabaseAdmin.from('vendedores').select('id,nome'),
    ]);
    if (error) throw error;
    const nome = new Map((vends || []).map((v) => [v.id, v.nome]));
    const perfil = new Map((perfis || []).map((p) => [p.vendedor_id, p]));
    return NextResponse.json({
      vendedores: (data || []).map((l) => ({
        id: l.vendedor_id, nome: nome.get(l.vendedor_id) || `#${l.vendedor_id}`, geradoEm: l.gerado_em, cidades: l.cidades,
        contatos: (l.itens as { tipo: string }[]).length,
        porTipo: ['carteira', 'recuperar', 'novos'].map((t) => (l.itens as { tipo: string }[]).filter((i) => i.tipo === t).length),
        perfil: perfil.get(l.vendedor_id) || null,
      })),
    });
  } catch (e) {
    if (migracaoFaltando(e)) return NextResponse.json({ error: MIGRACAO, migracaoFaltando: true }, { status: 503 });
    return erroIV(e, 'feed GET');
  }
}

export async function POST(req: Request) {
  const g = await guardarIV(req);
  if (g.resposta) return g.resposta;
  const a = g.auth!;
  if (!(a.isAdmin || a.modulos.includes('inteligencia-vendas'))) return NextResponse.json({ error: 'Só o administrador gera o feed agora' }, { status: 403 });
  try {
    const r = await gerarFeeds();
    await logIV(a, { acao: 'feed_gerar', detalhes: { vendedores: r.vendedores, contatos: r.contatos, semCidade: r.semCidade } });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (migracaoFaltando(e)) return NextResponse.json({ error: MIGRACAO, migracaoFaltando: true }, { status: 503 });
    return erroIV(e, 'feed POST');
  }
}
