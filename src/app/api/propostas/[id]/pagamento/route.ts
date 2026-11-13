// Pagamento estruturado de UMA proposta (entrada + parcelas / financiamento).
// GET  -> { pagamento | null, migracaoFaltando? }
// PUT  -> grava (upsert) e devolve o resumo para o campo "Condicoes".
// Tabela proposta_pagamento (sql/proposta-pagamento.sql). Nada é gravado em
// "Formulario" por aqui — a tela segue salvando o texto das Condições como sempre.
import { NextResponse } from 'next/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { normalizarPagamento, resumoCondicoes } from '@/lib/propostas/pagamento';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACESSO = [{ modulo: 'propostas' }, { modulo: 'pedidos-maquinas' }];
const faltaTabela = (e: { code?: string } | null) => e?.code === '42P01' || e?.code === 'PGRST205';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Proposta inválida' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('proposta_pagamento').select('*').eq('proposta_id', id).maybeSingle();
  if (faltaTabela(error)) return NextResponse.json({ pagamento: null, migracaoFaltando: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pagamento: data ? normalizarPagamento(data) : null, atualizado: data ? { por: data.atualizado_por, em: data.atualizado_em } : null });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ modulo: 'propostas' }]);
  if (g.resposta) return g.resposta;
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Proposta inválida' }, { status: 400 });

  const p = normalizarPagamento(await req.json().catch(() => ({})));
  const linha = { proposta_id: id, ...p, atualizado_por: autorDe(g.user), atualizado_em: new Date().toISOString() };
  const { error } = await supabaseAdmin.from('proposta_pagamento').upsert(linha, { onConflict: 'proposta_id' });
  if (faltaTabela(error)) {
    return NextResponse.json({ error: 'Falta aplicar sql/proposta-pagamento.sql no Supabase.', migracaoFaltando: true }, { status: 503 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === '23503' ? 404 : 500 });

  await supabaseAdmin.from('audit_log').insert({
    user_id: g.user.id, user_nome: autorDe(g.user), sistema: 'Proposta Comercial', acao: 'pagamento',
    entidade: 'proposta', entidade_id: String(id), detalhes: { forma: p.forma, entrada: p.entrada_valor, parcelas: p.parcelas.length },
  }).then(() => null, () => null);

  return NextResponse.json({ ok: true, pagamento: p, resumo: resumoCondicoes(p) });
}
