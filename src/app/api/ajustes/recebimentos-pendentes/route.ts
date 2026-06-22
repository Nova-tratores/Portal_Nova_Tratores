import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { obterRecebimentosPendentes, enriquecerResponsaveis } from '@/lib/ajustes/recebimentos';
import { fmtBR, parseAnyDate, hoje, addMeses } from '@/lib/ajustes/dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Recebimentos de NF-e pendentes com projeção de impacto no CMC. Janela default: 6 meses.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const de = sp.get('de');
  const ate = sp.get('ate');
  const force = sp.get('force') === '1' || sp.get('force') === 'true';
  const dtAte = de && ate && parseAnyDate(ate) ? (parseAnyDate(ate) as Date) : hoje();
  const dtDe = de && ate && parseAnyDate(de) ? (parseAnyDate(de) as Date) : addMeses(dtAte, -6);
  try {
    const out = await obterRecebimentosPendentes(conta, fmtBR(dtDe), fmtBR(dtAte), force);
    // responsavel resolvido SEMPRE fresco (fora do cache da analise) p/ refletir transferencias
    await enriquecerResponsaveis(conta, out?.recebimentos || []);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
