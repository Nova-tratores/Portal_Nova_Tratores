// Publica UM aviso na hora (chamado pelo front logo após criar um aviso não
// agendado). O leque de notificações por setor vive em lib/avisos/publicar.
import { NextRequest, NextResponse } from 'next/server';
import { publicarAviso } from '@/lib/avisos/publicar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { aviso_id } = (await req.json().catch(() => ({}))) as { aviso_id?: string };
  if (!aviso_id) return NextResponse.json({ ok: false, erro: 'aviso_id obrigatório' }, { status: 400 });
  const r = await publicarAviso(aviso_id, { notificarCriador: false });
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
