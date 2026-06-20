/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { corrigirContaMassa, validarCorrecao, type Distribuicao } from '@/lib/ajustes/contas';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// WRITE no Omie: corrige categoria/departamento de vários lançamentos (loop + throttle).
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => ({}))) as any;
    const codigoCategoria = b.codigoCategoria != null && String(b.codigoCategoria).trim() !== '' ? String(b.codigoCategoria) : null;
    const distribuicao: Distribuicao[] | null = Array.isArray(b.distribuicao) && b.distribuicao.length ? b.distribuicao : null;
    const erroVal = validarCorrecao({ codigoCategoria, distribuicao });
    if (erroVal) return NextResponse.json({ ok: false, erro: erroVal }, { status: 400 });
    if (!Array.isArray(b.itens) || !b.itens.length) return NextResponse.json({ ok: false, erro: 'itens vazio' }, { status: 400 });
    const out = await corrigirContaMassa(b);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
