import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { definirPagoFabrica } from '@/lib/garantias/pago-fabrica-server';

// PATCH /api/garantias/[id]/pago-fabrica { horas, km } — horas/km que a fábrica
// realmente pagou (DRVG); refaz o valor pago com a taxa da montadora.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias', acao: 'analisar' }, { modulo: 'garantias', acao: 'finalizar' }]);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const r = await definirPagoFabrica(id, Number(b.horas), Number(b.km), autorDe(guarda.user));
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json(r);
}
