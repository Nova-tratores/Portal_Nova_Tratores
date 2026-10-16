import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { obterProjetos } from '@/lib/ajustes/contas';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Projetos da empresa (espelho portal_nt_projetos_PRINCIPAL, sem ir à Omie), para o
// seletor de projeto na correção de contas. Exige login no módulo Ajustes.
export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'ajustes' }]);
  if (guarda.resposta) return guarda.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    return NextResponse.json({ projetos: await obterProjetos(conta) });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
