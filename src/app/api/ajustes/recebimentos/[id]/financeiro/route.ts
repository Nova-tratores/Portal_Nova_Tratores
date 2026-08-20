import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { consultarRecebimentoFinanceiro } from '@/lib/ajustes/omie';

export const dynamic = 'force-dynamic';

// Prefill da seção "Financeiro / Classificação" do modal de dar-entrada:
// categoria/conta/data (infoAdicionais) + parcelas que a NF já traz do XML.
// GET ?conta=NOVA
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const { id } = await params;
    const fin = await consultarRecebimentoFinanceiro(conta, id);
    return NextResponse.json(fin);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
