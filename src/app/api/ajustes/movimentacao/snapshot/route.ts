import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { resolveJanelaBR } from '@/lib/ajustes/cmc';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';
import { criarSnapshotMovimentacao, lerSnapshotMovimentacao } from '@/lib/ajustes/movimentacao';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // criar pode disparar a consulta Omie se o cache expirou

// POST: cria um snapshot compartilhável da consulta. Body: {conta, idProd, de, ate}.
// Exige login + acesso à página (estoque / estoque:movimentacao-produto).
export async function POST(req: NextRequest) {
  try {
    const user = await exigirPermissao(req, 'estoque', 'movimentacao-produto');
    const body = (await req.json().catch(() => ({}))) as { conta?: string; idProd?: number; de?: string; ate?: string };
    const conta = parseConta(body.conta ?? null) ?? CONTA_DEFAULT;
    const idProd = Number(body.idProd);
    if (!Number.isFinite(idProd) || idProd <= 0) {
      return NextResponse.json({ erro: 'informe idProd' }, { status: 400 });
    }
    const { dataDeBR, dataAteBR } = resolveJanelaBR(body.de ?? null, body.ate ?? null);
    const r = await criarSnapshotMovimentacao(conta, idProd, dataDeBR, dataAteBR, user.nome || user.email || user.id);
    return NextResponse.json(r);
  } catch (e) {
    const err = e as { http?: number; faultstring?: string };
    return NextResponse.json({ erro: err.faultstring || (e as Error).message }, { status: err.http || 500 });
  }
}

// GET: lê um snapshot pelo hash (?hash=). 404 inexistente, 410 expirado.
export async function GET(req: NextRequest) {
  try {
    await exigirPermissao(req, 'estoque', 'movimentacao-produto');
    const hash = req.nextUrl.searchParams.get('hash') || '';
    const snap = await lerSnapshotMovimentacao(hash);
    if (!snap) return NextResponse.json({ erro: 'snapshot não encontrado' }, { status: 404 });
    if ('expirado' in snap) return NextResponse.json({ erro: 'este link expirou (validade 30 dias) — peça um novo ou consulte ao vivo' }, { status: 410 });
    return NextResponse.json(snap);
  } catch (e) {
    const err = e as { http?: number };
    return NextResponse.json({ erro: (e as Error).message }, { status: err.http || 500 });
  }
}
