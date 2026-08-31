import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { detalheBucket } from '@/lib/estoque/reconciliacao';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET .../reconciliacao/detalhe?conta=nova&grupo=peca&ano=2026&mes=3&bucket=compra
// Composição de uma célula: movimentos do razão agregados por produto. bucket
// vazio = todos (Δ Estoque do mês).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta((sp.get('conta') || '').toUpperCase()); // undefined = TODAS
  const grupo = sp.get('grupo') === 'maquina' ? 'maquina' : 'peca';
  const ano = parseInt(sp.get('ano') || '0') || 0;
  const mes = parseInt(sp.get('mes') || '0') || 0;
  const bucket = sp.get('bucket') || '';
  if (!ano || !mes) return NextResponse.json({ erro: 'ano/mes obrigatórios' }, { status: 400 });
  try {
    const r = await detalheBucket(conta, grupo, ano, mes, bucket);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
