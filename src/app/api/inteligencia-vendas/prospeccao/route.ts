// GET /api/inteligencia-vendas/prospeccao[?atualizar=1] — a aba Prospecção numa leitura só:
// Carteira · Recuperar · Novos clientes · Território, com as falas do Tratorilson.
import { NextResponse } from 'next/server';
import { erroIV, guardarIV } from '@/lib/inteligencia-vendas/server';
import { carregarProspeccao } from '@/lib/inteligencia-vendas/prospeccao-server';
import { falasTratorilson } from '@/lib/inteligencia-vendas/prospeccao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  const g = await guardarIV(req, 'prospeccao');
  if (g.resposta) return g.resposta;
  try {
    const r = await carregarProspeccao(new URL(req.url).searchParams.get('atualizar') === '1');
    return NextResponse.json({ ...r, falas: falasTratorilson(r) });
  } catch (e) {
    return erroIV(e, 'prospeccao');
  }
}
