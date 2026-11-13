import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { ACESSO_RECEBIMENTOS } from '@/lib/ajustes/recebimentos-espelho';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { previaRelancamento, relancarPagamentos, tabelaFaltando } from '@/lib/estoque/reversao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BAIXA_CONTAS = [{ modulo: 'financeiro', acao: 'baixa-contas' }, { modulo: 'ajustes', acao: 'baixa-contas' }];

function contaDe(req: NextRequest): 'NOVA' | 'CASTRO' | null {
  const c = String(parseConta(req.nextUrl.searchParams.get('conta')) || '').toUpperCase();
  return c === 'NOVA' || c === 'CASTRO' ? c : null;
}

// GET ?conta= — prévia: cada pagamento guardado na reversão e a conta a pagar nova onde ele entra.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, ACESSO_RECEBIMENTOS);
  if (g.resposta) return g.resposta;
  const conta = contaDe(req);
  if (!conta) return NextResponse.json({ erro: 'Escolha NOVA ou CASTRO.' }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json(await previaRelancamento(conta, parseInt(id, 10)));
  } catch (e) {
    if (tabelaFaltando(e)) return NextResponse.json({ ficha: null, migracaoFaltando: true });
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}

// POST ?conta= { itens: [{ indice, tituloNovo }] } — LANÇA OS PAGAMENTOS NA OMIE (Baixar contas).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, BAIXA_CONTAS);
  if (g.resposta) return NextResponse.json({ erro: 'Relançar pagamentos exige a permissão "Baixar contas" do Financeiro.' }, { status: 403 });
  const conta = contaDe(req);
  if (!conta) return NextResponse.json({ erro: 'Escolha NOVA ou CASTRO.' }, { status: 400 });
  const { id } = await params;
  const idReceb = parseInt(id, 10);
  const body = (await req.json().catch(() => ({}))) as { itens?: Array<{ indice: number; tituloNovo: number }> };
  const itens = (body.itens || []).filter((i) => Number.isInteger(i.indice) && Number(i.tituloNovo) > 0);
  if (!itens.length) return NextResponse.json({ erro: 'Nenhum pagamento escolhido.' }, { status: 400 });
  const quem = g.user.nome || g.user.email || 'portal';
  try {
    const r = await relancarPagamentos({ conta, idReceb, itens, userNome: quem });
    await registrarAuditLog({
      userId: g.user.id, userName: quem, sistema: 'recebimentos', acao: 'relancar_pagamentos',
      entidade: 'recebimento_nfe', entidadeId: String(idReceb), entidadeLabel: `Recebimento ${idReceb} (${conta})`,
      detalhes: { conta, id_receb: idReceb, itens, resultado: r },
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
