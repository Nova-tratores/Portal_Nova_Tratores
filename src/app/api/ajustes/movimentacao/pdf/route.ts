import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { resolveJanelaBR } from '@/lib/ajustes/cmc';
import { obterMovimentacaoProduto } from '@/lib/ajustes/movimentacao';
import { gerarPDFMovimentacao } from '@/lib/ajustes/pdf-movimentacao';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// PDF (impressão) da movimentação do produto no período. Query: conta, idProd,
// de/ate (YYYY-MM-DD), cancelados=1 p/ incluir cancelados.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const idProd = Number(sp.get('idProd'));
  const incluirCancelados = sp.get('cancelados') === '1';
  if (!Number.isFinite(idProd) || idProd <= 0) {
    return NextResponse.json({ erro: 'informe idProd' }, { status: 400 });
  }
  const { dataDeBR, dataAteBR } = resolveJanelaBR(sp.get('de'), sp.get('ate'));
  try {
    const payload = await obterMovimentacaoProduto(conta, idProd, dataDeBR, dataAteBR);
    const buffer = await gerarPDFMovimentacao(payload, incluirCancelados);
    const nome = `movimentacao-${payload.produto.codigo || idProd}-${dataDeBR.replace(/\//g, '-')}-a-${dataAteBR.replace(/\//g, '-')}.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nome}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ erro: (e as { faultstring?: string }).faultstring || (e as Error).message }, { status: 500 });
  }
}
