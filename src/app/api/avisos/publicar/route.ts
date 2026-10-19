// Publica UM aviso na hora (chamado pelo front logo após criar um aviso não
// agendado). O leque de notificações por setor vive em lib/avisos/publicar.
import { NextRequest, NextResponse } from 'next/server';
import { publicarAviso } from '@/lib/avisos/publicar';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Tela /avisos: só quem cria aviso publica (pode('avisos', 'criar')).
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'avisos', acao: 'criar' }]);
  if (g.resposta) return g.resposta;
  const { aviso_id } = (await req.json().catch(() => ({}))) as { aviso_id?: string };
  if (!aviso_id) return NextResponse.json({ ok: false, erro: 'aviso_id obrigatório' }, { status: 400 });
  const r = await publicarAviso(aviso_id, { notificarCriador: false });
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
