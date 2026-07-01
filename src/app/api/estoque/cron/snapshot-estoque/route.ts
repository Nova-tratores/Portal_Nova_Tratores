import { NextRequest, NextResponse } from 'next/server';
import { cronSnapshotEstoque } from '@/lib/estoque/cron';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Captura o snapshot mensal de estoque por família (mês corrente), por conta.
// Disparado por cron com Bearer CRON_SECRET, ou manualmente para semear já.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const r = await cronSnapshotEstoque();
    return NextResponse.json({ sucesso: true, resultado: r, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
