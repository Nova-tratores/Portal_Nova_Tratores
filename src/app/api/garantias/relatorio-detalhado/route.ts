import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { detalharGarantias } from '@/lib/garantias/relatorio-detalhado-server';

// POST /api/garantias/relatorio-detalhado { ids } — dados da impressão detalhada
// das garantias finalizadas (horas/km, peças pagas × repostas, NFS-e, serviço da OS).
export async function POST(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias' }]);
  if (guarda.resposta) return guarda.resposta;
  const b = await req.json().catch(() => ({}));
  const ids = Array.isArray(b.ids) ? b.ids.filter((x: unknown): x is string => typeof x === 'string').slice(0, 400) : [];
  if (!ids.length) return NextResponse.json({ garantias: [] });
  try {
    return NextResponse.json({ garantias: await detalharGarantias(ids) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao montar o relatório.' }, { status: 500 });
  }
}
