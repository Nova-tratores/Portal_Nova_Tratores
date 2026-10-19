import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { consultarTitulo } from '@/lib/ajustes/contas';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Consulta UM título no Omie (para abrir o modal de baixa).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'baixa-contas' }]);
  if (g.resposta) return g.resposta;
  const sp = req.nextUrl.searchParams;
  const tipo = sp.get('tipo') === 'receber' ? 'receber' : 'pagar';
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const codigoLancamento = sp.get('codigoLancamento');
  if (codigoLancamento == null) return NextResponse.json({ erro: 'informe codigoLancamento' }, { status: 400 });
  try {
    return NextResponse.json(await consultarTitulo(conta, tipo, codigoLancamento));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}
