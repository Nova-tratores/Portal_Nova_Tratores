import { NextResponse } from 'next/server';
import { getContasOmie } from '@/lib/estoque/conta';

export const dynamic = 'force-dynamic';

// Lista as contas Omie configuradas (para o seletor de conta do front).
export async function GET() {
  return NextResponse.json({ contas: getContasOmie() });
}
