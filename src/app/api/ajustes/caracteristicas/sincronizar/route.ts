import { NextRequest, NextResponse } from 'next/server';
import { iniciarSyncCaracteristicas } from '@/lib/ajustes/caracteristicas';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Inicia a varredura de características (todas as contas) em background (worker-ready).
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'caracteristicas' }]);
  if (g.resposta) return g.resposta;
  try {
    const r = await iniciarSyncCaracteristicas(autorDe(g.user));
    return NextResponse.json(r, { status: r.jaRodando ? 409 : 202 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
