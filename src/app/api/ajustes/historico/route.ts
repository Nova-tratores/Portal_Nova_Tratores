import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { listarHistorico } from '@/lib/ajustes/cmc';

export const dynamic = 'force-dynamic';

// Histórico das correções de CMC (cmc_correcoes). conta e produto opcionais.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const produtoRaw = sp.get('produto');
  const produto = produtoRaw && Number.isFinite(parseInt(produtoRaw, 10)) ? parseInt(produtoRaw, 10) : null;
  const origemRaw = sp.get('origem');
  const origem = origemRaw && ['estoque_negativo', 'garantia', 'ajuste_custo', 'manual'].includes(origemRaw) ? origemRaw : null;
  try {
    const linhas = await listarHistorico(conta, produto, origem);
    return NextResponse.json({ linhas });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
