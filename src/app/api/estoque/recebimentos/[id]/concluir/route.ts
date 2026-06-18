import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { concluirRecebimento } from '@/lib/estoque/recebimentos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Concluir: ESCREVE NO OMIE (ConcluirRecebimento cEtapa=60). A conta concreta é
// derivada da própria linha. Portado de POST /api/recebimentos/:id/concluir (server.js:7757).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { codigo_categoria?: string };
    const r = await concluirRecebimento(conta, parseInt(id, 10), body.codigo_categoria || undefined);
    if (r.naoEncontrado) return NextResponse.json({ erro: r.erro }, { status: 404 });
    if (r.erro) return NextResponse.json({ erro: r.erro });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
