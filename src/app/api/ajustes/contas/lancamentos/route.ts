import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { lancamentosContas, statusInPorSituacao } from '@/lib/ajustes/contas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lançamentos de uma categoria/departamento específico.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tipo = sp.get('tipo') === 'receber' ? 'receber' : 'pagar';
  const dim = sp.get('dim') === 'departamento' ? 'departamento' : 'categoria';
  const conta = parseConta(sp.get('conta'));
  const codigoRaw = sp.get('codigo');
  const codigo = codigoRaw != null && codigoRaw !== '' && codigoRaw !== '(sem)' ? String(codigoRaw) : null;
  const statusIn = statusInPorSituacao(sp.get('situacao'));
  try {
    const out = await lancamentosContas(tipo, dim, conta, sp.get('de'), sp.get('ate'), codigo, statusIn);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
