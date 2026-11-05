import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { dispensarReembolso } from '@/lib/garantias/notas-server';

// PATCH /api/garantias/[id]/reembolso { dispensado: boolean }
// "Não precisa de NFS-e de reembolso" — tira a garantia da coluna "falta NFS-e".
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias', acao: 'analisar' }, { modulo: 'garantias', acao: 'finalizar' }]);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const r = await dispensarReembolso(id, !!b.dispensado, autorDe(guarda.user));
  if (!r.ok) return NextResponse.json({ error: r.erro, migracaoFaltando: r.migracaoFaltando || false }, { status: r.status });
  return NextResponse.json({ ok: true });
}
