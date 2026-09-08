import { NextRequest, NextResponse } from 'next/server';
import { cronApoiosVencendo } from '@/lib/marketing/apoios-vencendo';

// Cron: avisa por e-mail os apoios de fábrica com contrapartida vencendo ou
// vencida. É o que impede a verba de ficar parada porque ninguém lembrou do
// relatório. Config (ligado, destinatários, janela) em Dev → Envios de e-mail.
// Disparado pelo GitHub Actions (.github/workflows/marketing-apoios-vencendo.yml).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET || '';

// Fail-closed: sem CRON_SECRET no ambiente, a rota RECUSA tudo.
function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const alt = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '';
  return !!CRON_SECRET && (auth === `Bearer ${CRON_SECRET}` || alt === CRON_SECRET);
}

async function executar(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const resultado = await cronApoiosVencendo({ origem: 'cron' });
    return NextResponse.json({ sucesso: true, resultado, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return executar(req); }
export async function POST(req: NextRequest) { return executar(req); }
