import { NextResponse } from 'next/server';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';

// Porta das rotas /api/estoque/dashboard/*: exige login e a mesma permissão da
// tela (pode('estoque','dashboard') — módulo `estoque` inteiro, `estoque:dashboard`
// ou admin/dev). Antes as rotas eram abertas: qualquer um com a URL lia vendas e
// clientes, e o GET principal disparava sync com a Omie.
// Devolve a resposta de erro (401/403) ou null quando pode seguir.
export async function negarSemDashboard(req: Request): Promise<NextResponse | null> {
  try {
    await exigirPermissao(req, 'estoque', 'dashboard');
    return null;
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: (e as { status?: number }).status ?? 401 });
  }
}
