// PDF do relatório de contrapartida — abre inline no navegador.
// Gerar/baixar exige só o acesso ao módulo; ENVIAR à fábrica é outra permissão.
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { dadosDoRelatorio, gerarPDFContrapartida } from '@/lib/marketing/relatorio-contrapartida';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request, ctx: { params: Promise<{ apoioId: string }> }) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;

  try {
    const { apoioId } = await ctx.params;
    const rel = await dadosDoRelatorio(apoioId);
    if (!rel) return NextResponse.json({ error: 'Apoio não encontrado' }, { status: 404 });

    const pdf = await gerarPDFContrapartida(rel);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="relatorio-contrapartida-${apoioId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return erroResposta(e, 'GET /contrapartida/pdf');
  }
}
