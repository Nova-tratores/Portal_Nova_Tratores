// GET /api/financeiro/contas-cliente/buscar?q= — nome (sem acento) ou CPF/CNPJ no
// cadastro Omie; agrupa NOVA + CASTRO pelo documento (o mesmo cadastro serve de
// cliente e de fornecedor na Omie).
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { buscarPessoas } from '@/lib/financeiro/contas-cliente-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'financeiro', acao: 'contas-cliente' }]);
  if (g.resposta) return g.resposta;
  try {
    const r = await buscarPessoas(req.nextUrl.searchParams.get('q') || '');
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error('[contas-cliente] buscar', e);
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Erro na busca' }, { status: 500 });
  }
}
