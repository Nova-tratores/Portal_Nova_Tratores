import { NextResponse } from 'next/server';
import { getResolverFornStatus } from '@/lib/estoque/notas-entrada';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Progresso do job de resolução de fornecedores (estado em memória do processo).
export async function GET(req: Request) {
  const g = await protegerRota(req, [{ modulo: 'estoque', acao: 'notas-entrada' }]);
  if (g.resposta) return g.resposta;
  return NextResponse.json(getResolverFornStatus());
}
