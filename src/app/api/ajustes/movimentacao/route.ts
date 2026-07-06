import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { resolveJanelaBR } from '@/lib/ajustes/cmc';
import { obterMovimentacaoProduto } from '@/lib/ajustes/movimentacao';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Movimentos de estoque (entradas/saídas) de um produto no período, com
// cliente/fornecedor cruzado das tabelas locais. Query: conta, idProd
// (codigo_produto Omie), de/ate (YYYY-MM-DD), force=1.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const idProd = Number(sp.get('idProd'));
  const force = sp.get('force') === '1' || sp.get('force') === 'true';
  if (!Number.isFinite(idProd) || idProd <= 0) {
    return NextResponse.json({ erro: 'informe idProd (codigo_produto do Omie)' }, { status: 400 });
  }
  const { dataDeBR, dataAteBR } = resolveJanelaBR(sp.get('de'), sp.get('ate'));
  try {
    const out = await obterMovimentacaoProduto(conta, idProd, dataDeBR, dataAteBR, force);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ erro: (e as { faultstring?: string }).faultstring || (e as Error).message }, { status: 500 });
  }
}
