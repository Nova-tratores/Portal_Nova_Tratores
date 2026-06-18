import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { iniciarBackfillEnriquecimento, getBackfillStatus } from '@/lib/estoque/notas-entrada';

export const dynamic = 'force-dynamic';

// Dispara o backfill de enriquecimento (nome emitente + categoria) em background.
// Portado de POST /api/notas-entrada/backfill-enriquecimento (server.js:7254).
export async function POST(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  const mes = parseInt(sp.get('mes') || '');
  const ano = parseInt(sp.get('ano') || '');
  if (!mes || !ano) return NextResponse.json({ erro: 'mes e ano obrigatorios' });
  const r = iniciarBackfillEnriquecimento(mes, ano, conta);
  if (!r.ok) return NextResponse.json({ erro: r.erro, status: getBackfillStatus(conta) });
  return NextResponse.json({ mensagem: 'Backfill iniciado em background', conta: conta || 'TODAS', mes, ano });
}
