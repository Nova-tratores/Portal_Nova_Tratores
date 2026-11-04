import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { pecasAprovadasDasGarantias } from '@/lib/garantias/notas-server';

// GET /api/garantias/pecas-fabrica — peças aprovadas das garantias aprovadas e a
// nota de reposição (entrada x.949) em que cada uma já chegou (só leitura).
export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias' }]);
  if (guarda.resposta) return guarda.resposta;
  try {
    return NextResponse.json({ garantias: await pecasAprovadasDasGarantias() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao ler as peças.' }, { status: 500 });
  }
}
