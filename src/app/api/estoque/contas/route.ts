import { NextResponse } from 'next/server';
import { getContasOmie } from '@/lib/estoque/conta';
import { autenticar } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

// Lista as contas Omie configuradas (para o seletor de conta do front).
// Só id + nome (sem chave da Omie): basta estar logado. O ContaProvider roda
// em várias telas (Estoque, /financeiro/notas…), então não amarra a um módulo.
export async function GET(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ erro: 'nao autenticado' }, { status: 401 });
  return NextResponse.json({ contas: getContasOmie() });
}
