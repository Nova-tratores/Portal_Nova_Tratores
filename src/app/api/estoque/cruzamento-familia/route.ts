import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { cruzamentoPorFamilia, type TipoFamilia } from '@/lib/estoque/cruzamento-familia';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/estoque/cruzamento-familia?mes=6&ano=2026&tipo=&conta=NOVA
// Cruza estoque atual × entradas do mês × saídas (vendas) do mês, por família.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const agora = new Date();
  const mes = parseInt(sp.get('mes') || '') || (agora.getMonth() + 1);
  const ano = parseInt(sp.get('ano') || '') || agora.getFullYear();
  const tipo = (sp.get('tipo') || '') as TipoFamilia;
  const conta = parseConta(sp.get('conta'));

  try {
    const r = await cruzamentoPorFamilia({ mes, ano, tipo }, conta);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
