import { NextRequest, NextResponse } from 'next/server';
import { cronSyncProdutos } from '@/lib/estoque/cron';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min

// Sync COMPLETO da tabela `produtos` (famílias + produtos + estoque) por conta.
// Porta o cron diário do app externo "Visual Estoque" — fonte de /visual-estoque.
// Disparado por cron com Bearer CRON_SECRET (1x/dia de madrugada).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const resultados = await cronSyncProdutos();
    return NextResponse.json({ sucesso: true, resultados, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: (e as Error).message }, { status: 500 });
  }
}
