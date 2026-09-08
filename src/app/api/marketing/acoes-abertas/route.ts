/* eslint-disable @typescript-eslint/no-explicit-any */
// Ações em que dá pra capturar lead agora — a lista curta que a tela mobile do
// estande (/lead) mostra no seletor.
//
// Rota à parte de /api/marketing/acoes de propósito: quem tem só o módulo
// satélite `lead` não pode ler a carteira inteira de ações, com orçamento e
// apoio de fábrica dentro.
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { db } from '@/lib/marketing/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardar(req, 'lead');
  if (g.resposta) return g.resposta;

  try {
    const { data, error } = await db
      .from('mkt_acoes')
      .select('id, nome, tipo, status, data_inicio, data_fim, cidade, uf')
      .is('deleted_at', null)
      .not('status', 'in', '("cancelada")')
      .order('data_inicio', { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    const hoje = new Date().toISOString().slice(0, 10);
    const acoes = data ?? [];

    // "Acontecendo agora": em andamento, ou o período de hoje cai dentro dela.
    // Se sobrar exatamente uma, a tela já vem com ela escolhida — no estande,
    // cada toque a menos é um lead a mais.
    const agora = acoes.filter((a: any) => {
      if (a.status === 'em_andamento') return true;
      const ini = a.data_inicio;
      const fim = a.data_fim || a.data_inicio;
      return !!ini && ini <= hoje && !!fim && fim >= hoje;
    });

    return NextResponse.json({ acoes, agora: agora.map((a: any) => a.id) });
  } catch (e) {
    return erroResposta(e, 'GET /acoes-abertas');
  }
}
