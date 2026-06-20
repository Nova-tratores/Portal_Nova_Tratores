/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { baixarTitulo } from '@/lib/ajustes/contas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// WRITE no Omie: baixa (marca pago/recebido) UM título (LancarPagamento/Recebimento).
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => ({}))) as any;
    const conta = parseConta(b.conta);
    if (!conta) return NextResponse.json({ ok: false, erro: 'informe conta (NOVA/CASTRO)' }, { status: 400 });
    if (b.codigoLancamento == null) return NextResponse.json({ ok: false, erro: 'informe codigoLancamento' }, { status: 400 });
    if (b.codigoContaCorrente == null || String(b.codigoContaCorrente).trim() === '')
      return NextResponse.json({ ok: false, erro: 'informe a conta corrente' }, { status: 400 });
    const valor = Number(b.valor);
    if (!(valor > 0)) return NextResponse.json({ ok: false, erro: 'informe um valor maior que zero' }, { status: 400 });
    const out = await baixarTitulo({ ...b, conta, valor });
    if (!out.ok) return NextResponse.json({ ok: false, erro: out.erro }, { status: 502 });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
