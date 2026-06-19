/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { aplicarCorrecaoLancamento, validarCorrecao, type Distribuicao } from '@/lib/ajustes/contas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// WRITE no Omie: corrige categoria/departamento de UM lançamento (AlterarConta*).
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => ({}))) as any;
    const conta = parseConta(b.conta);
    if (!conta) return NextResponse.json({ ok: false, erro: 'informe conta (NOVA/CASTRO)' }, { status: 400 });
    const tipo = b.tipo === 'receber' ? 'receber' : 'pagar';
    if (b.codigoLancamento == null) return NextResponse.json({ ok: false, erro: 'informe codigoLancamento' }, { status: 400 });
    const codigoCategoria = b.codigoCategoria != null && String(b.codigoCategoria).trim() !== '' ? String(b.codigoCategoria) : null;
    const distribuicao: Distribuicao[] | null = Array.isArray(b.distribuicao) && b.distribuicao.length ? b.distribuicao : null;
    const erroVal = validarCorrecao({ codigoCategoria, distribuicao });
    if (erroVal) return NextResponse.json({ ok: false, erro: erroVal }, { status: 400 });

    const out = await aplicarCorrecaoLancamento({ conta, tipo, codigoLancamento: b.codigoLancamento, codigoCategoria, distribuicao });
    if (!out.ok) return NextResponse.json({ ok: false, erro: out.erro }, { status: 502 });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
