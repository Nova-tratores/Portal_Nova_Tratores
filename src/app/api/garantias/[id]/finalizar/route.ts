import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { finalizarGarantia } from '@/lib/garantias/finalizar';

// POST /api/garantias/[id]/finalizar
// body: { resultado:'aprovada'|'rejeitada', motivo_recusa?, garantista_horas, garantista_km, garantista_obs?, garantista_nome? }
// Regras em lib/garantias/finalizar.ts (a DRVG usa a mesma função).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias', acao: 'finalizar' }]);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  const body = await req.json();
  const r = await finalizarGarantia(id, body, autorDe(guarda.user));
  return NextResponse.json(r.json, { status: r.status });
}
