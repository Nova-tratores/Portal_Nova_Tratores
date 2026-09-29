// Assinatura do cliente da OS (uso pelo POS, qualquer tipo de serviço).
//   GET   → registro (cria o link na 1ª vez) + link + mensagem do WhatsApp + resumo
//   PATCH → { acao: 'reabrir' } apaga a assinatura e gera link novo
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { ErroAssinatura, garantirAssinatura, linkAssinatura, mensagemAssinatura, reabrir, resumoDaOS, type AssinaturaRow } from '@/lib/pos/assinatura-cliente-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resposta(a: AssinaturaRow) {
  const resumo = await resumoDaOS(a.os_id);
  const link = linkAssinatura(a.token);
  return { assinatura: a, link, mensagemWhatsApp: mensagemAssinatura(resumo, link), resumo };
}

function erro(e: unknown) {
  if (e instanceof ErroAssinatura) {
    const st = e.codigo === 'os_nao_encontrada' ? 404 : e.codigo === 'tabela_ausente' ? 503 : 422;
    return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: st });
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  try { return NextResponse.json(await resposta(await garantirAssinatura(id, auth.email || null))); } catch (e) { return erro(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.acao === 'reabrir') return NextResponse.json(await resposta(await reabrir(id)));
    return NextResponse.json({ error: 'ação inválida' }, { status: 400 });
  } catch (e) { return erro(e); }
}
