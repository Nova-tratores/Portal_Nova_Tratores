import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { serieEstoqueTipo, ultimosMeses } from '@/lib/estoque/cruzamento-familia';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/estoque/cruzamento-familia/serie-tipo?meses=12&conta=NOVA&semtipo=0
// Série mensal do SALDO de estoque (R$) das Peças, uma linha por "Tipo".
// semtipo=1 inclui o bucket "Sem tipo" (oculto por padrão por dominar o gráfico).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const n = Math.min(48, Math.max(2, parseInt(sp.get('meses') || '12') || 12));
  const conta = parseConta(sp.get('conta'));
  const incluirSemTipo = sp.get('semtipo') === '1';

  try {
    const r = await serieEstoqueTipo(ultimosMeses(n), conta, incluirSemTipo);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
