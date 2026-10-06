/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// PAINEL da página da garantia — aba "Página do cliente" em /garantias.
//
// GET   /api/garantia-cliente/painel?dias=30  -> uso da página + dúvidas
// PATCH /api/garantia-cliente/painel          { id, status?, resposta? }
// Gate: módulo garantias (o mesmo da tela).
// =============================================================================
import { NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { STATUS_DUVIDA, limparTexto, type StatusDuvida } from '@/lib/garantias/pagina-cliente';
import { painel, atualizarDuvida, migrationFaltou, MSG_MIGRATION } from '@/lib/garantias/pagina-cliente-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACESSO = [{ modulo: 'garantias' }];

export async function GET(req: Request) {
  const acesso = await protegerRota(req, ACESSO);
  if (acesso.resposta) return acesso.resposta;
  const dias = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get('dias')) || 30));
  try {
    return NextResponse.json({ ok: true, ...(await painel(dias)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ ok: true, migracaoFaltando: true, erro: MSG_MIGRATION });
    console.error('[garantia-cliente] painel:', e);
    return NextResponse.json({ ok: false, erro: 'Erro ao carregar o painel' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const acesso = await protegerRota(req, ACESSO);
  if (acesso.resposta) return acesso.resposta;
  const corpo = (await req.json().catch(() => ({}))) as any;
  const id = Number(corpo?.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, erro: 'id inválido' }, { status: 400 });
  const status = corpo?.status as StatusDuvida | undefined;
  if (status && !STATUS_DUVIDA.includes(status)) return NextResponse.json({ ok: false, erro: 'status inválido' }, { status: 400 });
  const resposta = corpo?.resposta === undefined ? undefined : (limparTexto(corpo.resposta, 4000) || null);
  try {
    const duvida = await atualizarDuvida(id, { status, resposta }, acesso.user.nome || acesso.user.email || 'portal');
    return NextResponse.json({ ok: true, duvida });
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ ok: false, erro: MSG_MIGRATION }, { status: 503 });
    console.error('[garantia-cliente] patch:', e);
    return NextResponse.json({ ok: false, erro: 'Erro ao salvar' }, { status: 500 });
  }
}
