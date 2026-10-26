import { NextRequest, NextResponse } from 'next/server';
import { posicaoPorLocal, localSugerido } from '@/lib/ajustes/ajuste-estoque';
import type { HttpError } from '@/lib/ajustes/cmc';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import type { Conta } from '@/lib/ajustes/conta';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Físico + CMC do produto em cada local, AO VIVO no Omie.
export async function GET(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: 'ajustes', acao: 'ajuste-estoque' }]);
  if (acesso.resposta) return acesso.resposta;
  const conta = (req.nextUrl.searchParams.get('conta') || '').toUpperCase() as Conta;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ ok: false, erro: 'informe o produto' }, { status: 400 });
  try {
    const locais = await posicaoPorLocal(conta, id);
    return NextResponse.json({ ok: true, locais, sugerido: localSugerido(locais) });
  } catch (e) {
    const err = e as HttpError & { faultstring?: string };
    return NextResponse.json({ ok: false, erro: err.faultstring || err.message }, { status: err.http || 502 });
  }
}
