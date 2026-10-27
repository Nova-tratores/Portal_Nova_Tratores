// Monitor de uso do APP DE VENDAS (vendas-pwa): recebe os lotes que o celular
// juntou (telas, transições, atalhos, fluxos — já agregados por dia, porque o
// vendedor passa o dia sem sinal) e soma nas tabelas de uso. Telas e transições
// vão para as mesmas tabelas do portal (rota '/vendas/...'), então aparecem
// sozinhas nas abas Uso e Padrões de /atividades; atalhos e fluxos vão para
// portal_uso_app_eventos (sql/portal-uso-app.sql).
// Diferente de /api/uso/pagina: grava direto (o lote já vem somado) em vez do
// buffer de 60 s, e aceita o DIA de cada contagem (até 30 dias para trás).
//
// Resposta: 204 gravou · 400 lote inválido (o app descarta) · 503/500 o app
// guarda o lote e reenvia. Atalhos/fluxos gravam PRIMEIRO: sem a migration a
// rota recusa tudo (503) antes de somar telas, para o reenvio não contar 2×.
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { corsVendas } from '@/lib/vendas-app/cors';
import { validarLotes } from '@/lib/uso/app-vendas';
import { diaLocal } from '@/lib/uso/rota';

export const dynamic = 'force-dynamic';

const semMigration = (e: { code?: string; message?: string }) =>
  /PGRST202|42883|42P01|does not exist|schema cache/i.test(`${e.code || ''} ${e.message || ''}`);

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsVendas(req, 'POST, OPTIONS') });
}

export async function POST(req: NextRequest) {
  const cors = corsVendas(req, 'POST, OPTIONS');
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: cors });

  let corpo: unknown = null;
  try { corpo = await req.json(); } catch { /* corpo inválido */ }
  const lote = validarLotes(corpo, diaLocal());
  if ('erro' in lote) return NextResponse.json({ error: lote.erro }, { status: 400, headers: cors });

  const user_id = auth.userId;
  try {
    if (lote.eventos.length) {
      const { error } = await supabaseAdmin.rpc('portal_uso_incrementar_app', {
        p_itens: lote.eventos.map((e) => ({ user_id, ...e })),
      });
      if (error && semMigration(error)) {
        return NextResponse.json({ error: 'Aplicar sql/portal-uso-app.sql' }, { status: 503, headers: cors });
      }
      if (error) throw new Error(error.message);
    }
    if (lote.paginas.length) {
      const { error } = await supabaseAdmin.rpc('portal_uso_incrementar', {
        p_itens: lote.paginas.map((p) => ({ tipo: 'pagina', user_id, rota: p.rota, dia: p.dia, n: p.n })),
        p_presenca: [],
      });
      if (error) throw new Error(error.message);
    }
    if (lote.transicoes.length) {
      const { error } = await supabaseAdmin.rpc('portal_uso_incrementar_transicoes', {
        p_itens: lote.transicoes.map((t) => ({ user_id, ...t })),
      });
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: cors });
  }
  return new NextResponse(null, { status: 204, headers: cors });
}
