import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { lancamentosContas, statusInPorSituacao } from '@/lib/ajustes/contas';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lançamentos de uma categoria/departamento específico — ou dim=todos (modo Lista).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'correcao-contas' }]);
  if (g.resposta) return g.resposta;
  const sp = req.nextUrl.searchParams;
  const tipo = sp.get('tipo') === 'receber' ? 'receber' : 'pagar';
  const dimRaw = sp.get('dim');
  const dim = dimRaw === 'todos' ? 'todos' : dimRaw === 'departamento' ? 'departamento' : 'categoria';
  const limite = Math.min(5000, Math.max(1, parseInt(sp.get('limite') || '1000', 10) || 1000));
  const conta = parseConta(sp.get('conta'));
  const codigoRaw = sp.get('codigo');
  const codigo = codigoRaw != null && codigoRaw !== '' && codigoRaw !== '(sem)' ? String(codigoRaw) : null;
  const statusIn = statusInPorSituacao(sp.get('situacao'));
  try {
    const out = await lancamentosContas(tipo, dim, conta, sp.get('de'), sp.get('ate'), codigo, statusIn, limite);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
