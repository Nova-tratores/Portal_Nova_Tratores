import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { parseConta } from '@/lib/estoque/conta';
import { iniciarForcarResync, type MesAno } from '@/lib/estoque/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Re-sync forçado de uma lista de meses (background, lock per-conta). Sem lista,
// auto-detecta meses suspeitos. Portado de POST /api/admin/forcar-resync-meses
// (server.js:2542).
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'estoque', acao: 'admin' }]);
  if (g.resposta) return g.resposta;
  const body = (await req.json().catch(() => ({}))) as { conta?: string; meses?: MesAno[] };
  const conta = parseConta(body.conta);
  if (!conta) return NextResponse.json({ erro: 'Informe {conta: "NOVA"|"CASTRO"}' });
  try {
    const r = await iniciarForcarResync(conta, body.meses);
    return NextResponse.json({ conta, ...r });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message });
  }
}
