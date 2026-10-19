// GET /api/inteligencia-vendas/base — a ficha de cada cliente com movimento,
// cruzando cadastro Omie (NOVA+CASTRO), vendas, controle de revisões, OS,
// propostas e o CRM dos vendedores, já com as oportunidades e o score.
//   atualizar=1 → relê as fontes (senão usa o cache de 30 min)
import { NextResponse } from 'next/server';
import { carregarBase, erroIV, guardarIV, logIV } from '@/lib/inteligencia-vendas/server';
import { temMovimento } from '@/lib/inteligencia-vendas/base';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardarIV(req, 'oportunidades');
  if (g.resposta) return g.resposta;
  try {
    const atualizar = new URL(req.url).searchParams.get('atualizar') === '1';
    const { clientes, atualizadoEm } = await carregarBase(atualizar);
    if (atualizar) await logIV(g.auth!, { acao: 'atualizar_base' });
    const lista = clientes.filter((c) => temMovimento(c) || c.oportunidades.length > 0);
    return NextResponse.json({ clientes: lista, totalCadastro: clientes.length, atualizadoEm });
  } catch (e) {
    return erroIV(e, 'base');
  }
}
