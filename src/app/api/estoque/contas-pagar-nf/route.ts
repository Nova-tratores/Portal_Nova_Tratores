import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { buscarContasPagarNF } from '@/lib/estoque/notas-entrada';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Contas a pagar vinculadas a uma NF. Portado de /api/contas-pagar-nf (server.js:7094).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'estoque', acao: 'notas-entrada' }]);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  const numeroNf = sp.get('numero_nf');
  const cnpj = sp.get('cnpj');
  const dataEmissao = sp.get('data_emissao');
  if (!numeroNf) return NextResponse.json({ erro: 'numero_nf obrigatorio' });
  try {
    const titulos = await buscarContasPagarNF(numeroNf, cnpj, dataEmissao, conta ?? CONTA_DEFAULT);
    return NextResponse.json({ titulos });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
