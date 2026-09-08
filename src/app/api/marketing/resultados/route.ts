/* eslint-disable @typescript-eslint/no-explicit-any */
// Resultados comparados entre ações: custo, apoio, funil e ROI lado a lado.
//
// O cálculo é a lib PURA lib/marketing/roi.ts (testada no vitest), não uma view
// SQL — as regras de atribuição mudam, e mudar aqui é um push, não uma ida
// manual ao SQL Editor de produção.
import { NextResponse } from 'next/server';
import { guardar, erroResposta, num } from '@/lib/marketing/rota';
import { db, listarAcoes, propostasDaAcao } from '@/lib/marketing/db';
import { calcularROI } from '@/lib/marketing/roi';
import type { Acao, Apoio, Custo, Lead } from '@/lib/marketing/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;

  try {
    const url = new URL(req.url);
    const acoes = await listarAcoes({
      ano: num(url.searchParams.get('ano')) ?? undefined,
      tipo: url.searchParams.get('tipo') || undefined,
      status: url.searchParams.get('status') || undefined,
    });
    if (acoes.length === 0) return NextResponse.json({ resultados: [] });

    const ids = acoes.map((a) => a.id);
    // Uma consulta por tabela, não uma por ação.
    const [custos, apoios, leads] = await Promise.all([
      db.from('mkt_custos').select('*').in('acao_id', ids),
      db.from('mkt_apoios').select('*').in('acao_id', ids),
      db.from('mkt_leads').select('*').in('acao_id', ids),
    ]);

    const agrupar = <T extends { acao_id: string }>(linhas: T[] | null) => {
      const m: Record<string, T[]> = {};
      for (const l of linhas ?? []) (m[l.acao_id] ??= []).push(l);
      return m;
    };
    const porCusto = agrupar<Custo & { acao_id: string }>(custos.data as any);
    const porApoio = agrupar<Apoio & { acao_id: string }>(apoios.data as any);
    const porLead = agrupar<Lead & { acao_id: string }>(leads.data as any);

    const resultados = [];
    for (const acao of acoes as Acao[]) {
      resultados.push({
        acao,
        roi: calcularROI({
          acao,
          custos: porCusto[acao.id] ?? [],
          apoios: porApoio[acao.id] ?? [],
          leads: porLead[acao.id] ?? [],
          propostas: await propostasDaAcao(acao.id),
        }),
      });
    }

    return NextResponse.json({ resultados });
  } catch (e) {
    return erroResposta(e, 'GET /resultados');
  }
}
