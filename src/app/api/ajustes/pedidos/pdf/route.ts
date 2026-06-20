import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT, labelConta } from '@/lib/ajustes/conta';
import { listarPedidosEnriquecidos } from '@/lib/ajustes/pedidos';
import { gerarPDFPedidos } from '@/lib/ajustes/pdf-pedidos';
import { resolveJanelaBR } from '@/lib/ajustes/cmc';
import { fmtISO, hoje } from '@/lib/ajustes/dates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // pdfkit precisa do runtime Node
export const maxDuration = 300;

// Export PDF dos pedidos abertos da janela (1 conta especifica).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const { dataDeBR, dataAteBR } = resolveJanelaBR(sp.get('de'), sp.get('ate'));
  try {
    const peds = await listarPedidosEnriquecidos(conta, dataDeBR, dataAteBR);
    const buf = await gerarPDFPedidos({
      titulo: `Pedidos abertos - ${labelConta(conta)}`,
      subtitulo: `Janela ${dataDeBR} a ${dataAteBR}`,
      pedidos: peds, agrupado: false,
    });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="pedidos-abertos-${labelConta(conta)}-${fmtISO(hoje())}.pdf"`,
      },
    });
  } catch (e) {
    return new NextResponse('erro: ' + (e as Error).message, { status: 500 });
  }
}
