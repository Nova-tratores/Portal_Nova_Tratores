/* eslint-disable @typescript-eslint/no-explicit-any */
// Regras do Retorno (Fase 2 do plano do Marketing, 23/11/2026): margem padrão por tipo de máquina e janela de
// atribuição por tipo de ação. Tabela mkt_parametros (sql/marketing-fase2.sql), chave 'retorno'.
// GET → regras em vigor (padrão + o que a empresa gravou) · PATCH { margemPadraoPct, janelaDias } (acoes:editar)
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { db, obterRegrasRetorno } from '@/lib/marketing/db';
import { logMarketing, nomeDoUsuario } from '@/lib/marketing/server';
import { REGRAS_RETORNO_PADRAO } from '@/lib/marketing/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;
  return NextResponse.json({ regras: await obterRegrasRetorno(), padrao: REGRAS_RETORNO_PADRAO });
}

export async function PATCH(req: Request) {
  const g = await guardar(req, 'marketing', 'acoes:editar');
  if (g.resposta) return g.resposta;
  try {
    const b = await req.json().catch(() => ({} as any));
    // só aceita as chaves conhecidas, com números em faixa sensata
    const margemPadraoPct: Record<string, number> = {};
    for (const k of Object.keys(REGRAS_RETORNO_PADRAO.margemPadraoPct)) {
      const v = Number(b?.margemPadraoPct?.[k]);
      if (!Number.isFinite(v) || v < 0 || v > 80) return NextResponse.json({ error: `Margem de "${k}": use de 0 a 80%.` }, { status: 400 });
      margemPadraoPct[k] = Math.round(v * 10) / 10;
    }
    const janelaDias: Record<string, number | null> = {};
    for (const k of Object.keys(REGRAS_RETORNO_PADRAO.janelaDias)) {
      const bruto = b?.janelaDias?.[k];
      if (bruto === null || bruto === '') { janelaDias[k] = null; continue; }
      const v = Number(bruto);
      if (!Number.isInteger(v) || v < 0 || v > 365) return NextResponse.json({ error: `Prazo de "${k}": de 0 a 365 dias (vazio = sem prazo).` }, { status: 400 });
      janelaDias[k] = v;
    }
    const autor = await nomeDoUsuario(g.auth);
    const { error } = await db.from('mkt_parametros')
      .upsert({ chave: 'retorno', valor: { margemPadraoPct, janelaDias }, atualizado_em: new Date().toISOString(), atualizado_por: autor }, { onConflict: 'chave' });
    if (error) {
      if (/mkt_parametros/.test(error.message)) return NextResponse.json({ error: 'Falta rodar sql/marketing-fase2.sql no Supabase.' }, { status: 500 });
      throw Object.assign(new Error(error.message), { code: error.code });
    }
    await logMarketing(g.auth, { acao: 'editar', entidade: 'parametros', entidadeId: 'retorno', entidadeLabel: 'Regras do retorno', detalhes: { margemPadraoPct, janelaDias } });
    return NextResponse.json({ ok: true, regras: { margemPadraoPct, janelaDias } });
  } catch (e) {
    return erroResposta(e, 'PATCH /parametros');
  }
}
