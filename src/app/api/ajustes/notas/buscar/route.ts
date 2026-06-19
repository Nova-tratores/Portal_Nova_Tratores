import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { buscarNotas } from '@/lib/ajustes/notas';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Busca NF-e de saída por número (intervalo) ou por cliente (nome/CNPJ + janela). Só leitura.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  try {
    const out = await buscarNotas(conta, {
      modo: sp.get('modo') || 'numero',
      numero: sp.get('numero') || '',
      numeroAte: sp.get('numeroAte') || '',
      de: sp.get('de') || '',
      ate: sp.get('ate') || '',
      cliente: sp.get('cliente') || '',
    });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}
