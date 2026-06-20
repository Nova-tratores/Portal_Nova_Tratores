import { NextRequest, NextResponse } from 'next/server';
import { cronHomePrewarm } from '@/lib/ajustes/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || '';
function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  return !!CRON_SECRET && auth === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const resultado = await cronHomePrewarm();
    return NextResponse.json({ sucesso: true, resultado, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: (e as Error).message }, { status: 500 });
  }
}

export const POST = GET;
