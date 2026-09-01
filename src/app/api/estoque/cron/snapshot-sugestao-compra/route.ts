import { NextRequest, NextResponse } from 'next/server';
import { gerarSnapshotSugestao } from '@/lib/estoque/sugestao-compra/snapshot';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Gera o snapshot noturno da Sugestão de Compra (curva ABC + demanda + motor,
// consolidado NOVA+CASTRO por SKU). Disparado por cron com Bearer CRON_SECRET,
// ou manualmente para semear já. Ver .github/workflows/estoque-snapshot-sugestao-compra.yml
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const r = await gerarSnapshotSugestao();
    return NextResponse.json({ sucesso: true, resultado: r, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
