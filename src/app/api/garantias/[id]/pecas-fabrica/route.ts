import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { pecasAprovadasDasGarantias, definirFormaPeca, definirNotaPeca } from '@/lib/garantias/notas-server';

// GET /api/garantias/[id]/pecas-fabrica — peças aprovadas desta garantia, a nota
// de reposição em que cada uma chegou e o checklist reposta × paga.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias' }]);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  try {
    const [r] = await pecasAprovadasDasGarantias(id);
    return NextResponse.json(r || { garantiaId: id, pecas: [], notas: [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao ler as peças.' }, { status: 500 });
  }
}

// PATCH /api/garantias/[id]/pecas-fabrica { pecaId, forma: 'reposta'|'paga'|null }
//   ou { pecaId, notaId: <garantia_notas.id>|null } = em qual nota a peça chegou
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias', acao: 'analisar' }, { modulo: 'garantias', acao: 'finalizar' }]);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const forma = b.forma === 'reposta' || b.forma === 'paga' ? b.forma : null;
  if (!b.pecaId) return NextResponse.json({ error: 'Peça não informada.' }, { status: 400 });
  const r = 'notaId' in b
    ? await definirNotaPeca(id, String(b.pecaId), b.notaId ? String(b.notaId) : null, autorDe(guarda.user))
    : await definirFormaPeca(id, String(b.pecaId), forma, autorDe(guarda.user));
  if (!r.ok) return NextResponse.json({ error: r.erro, migracaoFaltando: r.migracaoFaltando || false }, { status: r.status });
  return NextResponse.json({ ok: true });
}
