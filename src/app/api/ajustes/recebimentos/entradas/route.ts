import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { listarEntradasLog } from '@/lib/ajustes/recebimentos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Histórico "Entradas feitas" desta tela: lê recebimento_entrada_log (dar_entrada +
// correcao_cmc) e cruza com o espelho. escopo=minhas exige userId (usuário logado).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const escopo = sp.get('escopo') === 'equipe' ? 'equipe' : 'minhas';
  const userId = sp.get('userId') || null;
  try {
    const entradas = await listarEntradasLog({
      conta,
      userId: escopo === 'minhas' ? userId : null,
      de: sp.get('de'),
      ate: sp.get('ate'),
    });
    return NextResponse.json({ entradas });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
