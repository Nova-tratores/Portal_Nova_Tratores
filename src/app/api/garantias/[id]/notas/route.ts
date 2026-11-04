import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { notasDaGarantia, decidirNota } from '@/lib/garantias/notas-server';

// GET /api/garantias/[id]/notas — NFS-e de reembolso e notas de peças recebidas
// sugeridas/vinculadas à garantia.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias' }]);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  try {
    const r = await notasDaGarantia(id);
    if (!r) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao buscar as notas.' }, { status: 500 });
  }
}

// POST /api/garantias/[id]/notas { papel, docId?, entradaId?, acao: vincular|descartar|desfazer, origem? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias', acao: 'analisar' }, { modulo: 'garantias', acao: 'finalizar' }]);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  if (!['reembolso', 'pecas'].includes(b.papel) || !['vincular', 'descartar', 'desfazer'].includes(b.acao)) {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
  const r = await decidirNota(id, { papel: b.papel, docId: b.docId, entradaId: b.entradaId, acao: b.acao, origem: b.origem, ator: autorDe(guarda.user) });
  if (!r.ok) return NextResponse.json({ error: r.erro, migracaoFaltando: r.migracaoFaltando || false }, { status: r.status });
  return NextResponse.json({ ok: true });
}
