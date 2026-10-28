import { NextRequest, NextResponse } from 'next/server';
import { ajustarEstoque } from '@/lib/ajustes/ajuste-estoque';
import type { HttpError } from '@/lib/ajustes/cmc';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// WRITE no Omie: ajusta quantidade e/ou custo de 1..10 produtos (NOVA e CASTRO
// no mesmo lote). gravar=false = só a prévia (relê tudo do Omie, não grava).
// O usuário sai do login, nunca do corpo.
export async function POST(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: 'ajustes', acao: 'ajuste-estoque' }]);
  if (acesso.resposta) return acesso.resposta;
  try {
    const body = await req.json().catch(() => ({}));
    const r = await ajustarEstoque(
      { itens: body?.itens, motivo: body?.motivo, gravar: body?.gravar === true },
      { id: acesso.user.id, nome: autorDe(acesso.user) },
    );
    return NextResponse.json(r);
  } catch (e) {
    const err = e as HttpError;
    return NextResponse.json({ ok: false, erro: err.message }, { status: err.http || 400 });
  }
}
