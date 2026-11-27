import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { ACESSO_RECEBIMENTOS } from '@/lib/ajustes/recebimentos-espelho';
import { listarAlertasFrete, marcarAlertaFrete } from '@/lib/estoque/fretes-custo-server';

export const dynamic = 'force-dynamic';

// Fretes fora do custo (achados pela varredura noturna fretes-custo-varredura).
// GET ?conta=&status=novo|todos · PATCH { ids: number[], status: 'visto'|'corrigido'|'novo' }
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, ACESSO_RECEBIMENTOS);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  if (!conta) return NextResponse.json({ erro: 'Escolha NOVA ou CASTRO.' }, { status: 400 });
  const status = req.nextUrl.searchParams.get('status') === 'todos' ? 'todos' : 'novo';
  return NextResponse.json(await listarAlertasFrete(conta, status));
}

export async function PATCH(req: NextRequest) {
  const g = await protegerRota(req, ACESSO_RECEBIMENTOS);
  if (g.resposta) return g.resposta;
  const body = await req.json().catch(() => ({}));
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n: number) => n > 0);
  const status = ['visto', 'corrigido', 'novo'].includes(body.status) ? body.status : null;
  if (!ids.length || !status) return NextResponse.json({ erro: 'ids e status' }, { status: 400 });
  try {
    await marcarAlertaFrete(ids, status, autorDe(g.user));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
