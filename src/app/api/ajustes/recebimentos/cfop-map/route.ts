import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { obterMapaCfopEntrada } from '@/lib/ajustes/recebimentos';

export const dynamic = 'force-dynamic';

// Mapa aprendido CFOP-saída(fornecedor) → CFOP-entrada, p/ pré-preencher o modal de
// dar-entrada. GET ?conta=NOVA
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const mapa = await obterMapaCfopEntrada(conta);
    return NextResponse.json({ mapa });
  } catch (e) {
    return NextResponse.json({ mapa: {}, erro: (e as Error).message }, { status: 500 });
  }
}
