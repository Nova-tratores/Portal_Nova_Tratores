// PÚBLICO (só o token): resumo da OS pra tela de assinatura do cliente.
import { NextRequest, NextResponse } from 'next/server';
import { ErroAssinatura, buscarPorToken, resumoDaOS } from '@/lib/pos/assinatura-cliente-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const a = await buscarPorToken(token);
    const r = await resumoDaOS(a.os_id);
    return NextResponse.json({ ...r, assinado: !!a.assinado_em, assinadoEm: a.assinado_em, assinadoNome: a.assinado_nome });
  } catch (e) {
    if (e instanceof ErroAssinatura) return NextResponse.json({ error: e.message }, { status: e.codigo === 'tabela_ausente' ? 503 : 404 });
    return NextResponse.json({ error: 'erro' }, { status: 500 });
  }
}
