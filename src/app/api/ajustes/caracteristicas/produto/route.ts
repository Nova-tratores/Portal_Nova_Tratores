/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { editarCaractProduto } from '@/lib/ajustes/caracteristicas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// WRITE no Omie: edita a característica de um produto (grava Omie + Supabase).
export async function POST(req: NextRequest) {
  try {
    const { empresa, codigo_produto, nome, conteudo } = (await req.json().catch(() => ({}))) as any;
    if (!empresa || !codigo_produto || !nome)
      return NextResponse.json({ erro: 'empresa, codigo_produto e nome sao obrigatorios' }, { status: 400 });
    const r = await editarCaractProduto(empresa, codigo_produto, nome, conteudo);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
