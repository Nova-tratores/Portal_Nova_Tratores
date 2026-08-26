import { NextResponse } from 'next/server';
import { getResolverFornStatus } from '@/lib/estoque/notas-entrada';

export const dynamic = 'force-dynamic';

// Progresso do job de resolução de fornecedores (estado em memória do processo).
export async function GET() {
  return NextResponse.json(getResolverFornStatus());
}
