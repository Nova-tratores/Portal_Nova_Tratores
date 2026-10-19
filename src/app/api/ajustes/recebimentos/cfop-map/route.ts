import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { obterMapaCfopEntrada } from '@/lib/ajustes/recebimentos';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Mapa aprendido CFOP-saída(fornecedor) → CFOP-entrada, p/ pré-preencher o modal de
// dar-entrada. GET ?conta=NOVA
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'estoque', acao: 'recebimentos' }, { modulo: 'ajustes', acao: 'recebimentos' }]);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const mapa = await obterMapaCfopEntrada(conta);
    return NextResponse.json({ mapa });
  } catch (e) {
    return NextResponse.json({ mapa: {}, erro: (e as Error).message }, { status: 500 });
  }
}
