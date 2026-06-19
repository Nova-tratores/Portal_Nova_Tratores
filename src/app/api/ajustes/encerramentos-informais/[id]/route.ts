import { NextRequest, NextResponse } from 'next/server';
import { obterEncerramento } from '@/lib/ajustes/pedidos';

export const dynamic = 'force-dynamic';

// JSON de 1 encerramento informal (recibo).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const data = await obterEncerramento(id);
    return NextResponse.json(data);
  } catch (e) {
    const status = (e as { http?: number }).http || 404;
    return NextResponse.json({ erro: (e as Error).message }, { status });
  }
}
