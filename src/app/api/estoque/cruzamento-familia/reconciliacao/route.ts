import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { ultimosMeses } from '@/lib/estoque/cruzamento-familia';
import { reconciliacaoLedger } from '@/lib/estoque/reconciliacao';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/estoque/cruzamento-familia/reconciliacao?meses=12&conta=nova&grupo=peca
// Reconciliação a partir do razão de estoque (estoque_movimentos): Δ Estoque
// decomposto por bucket (compra/venda/ajuste/remessa/frete/devoluções), estoque
// derivado do razão (âncora = estoque real de hoje).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const n = Math.min(48, Math.max(2, parseInt(sp.get('meses') || '12') || 12));
  const conta = parseConta((sp.get('conta') || '').toUpperCase()) ?? 'NOVA';
  const grupo = sp.get('grupo') === 'maquina' ? 'maquina' : 'peca';
  try {
    const r = await reconciliacaoLedger(ultimosMeses(n), conta, grupo);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
