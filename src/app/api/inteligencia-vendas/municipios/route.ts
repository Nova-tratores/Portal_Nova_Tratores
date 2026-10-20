// GET /api/inteligencia-vendas/municipios — ranking "onde focar":
// IBGE (área plantada, valor da produção, bovinos) + CAR/SICOR (imóveis,
// crédito rural) + a nossa base (clientes, tratores, propostas, peças).
//   todos=1 → além dos 45 municípios da loja, toda cidade com 5+ clientes
import { NextResponse } from 'next/server';
import { erroIV, guardarIV } from '@/lib/inteligencia-vendas/server';
import { carregarMunicipios } from '@/lib/inteligencia-vendas/municipios-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardarIV(req, 'municipios');
  if (g.resposta) return g.resposta;
  try {
    const todos = new URL(req.url).searchParams.get('todos') === '1';
    return NextResponse.json(await carregarMunicipios(todos));
  } catch (e) {
    return erroIV(e, 'municipios');
  }
}
