import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { montarFichaDevolucao } from '@/lib/ajustes/devolucao';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// SO LEITURA: monta a ficha de conferência da devolução triangular (NF de
// faturamento + NF de remessa por conta e ordem). Não escreve nada no Omie —
// quem emite as notas é o usuário, no Omie.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      conta?: string;
      faturamentoNumero?: string | number;
      faturamentoSerie?: string | null;
      remessaNumero?: string | number | null;
      remessaSerie?: string | null;
    };
    const conta = parseConta(body.conta) ?? parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
    if (body.faturamentoNumero == null || String(body.faturamentoNumero).trim() === '') {
      return NextResponse.json({ erro: 'informe o número da NF de faturamento' }, { status: 400 });
    }
    const ficha = await montarFichaDevolucao(conta, {
      faturamentoNumero: body.faturamentoNumero,
      faturamentoSerie: body.faturamentoSerie ?? null,
      remessaNumero: body.remessaNumero ?? null,
      remessaSerie: body.remessaSerie ?? null,
    });
    return NextResponse.json({ ok: true, conta, ...ficha });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}
