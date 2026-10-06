// =============================================================================
// ROTA PÚBLICA — dúvida enviada pela página da garantia (QR code). SEM LOGIN.
//
// POST /api/garantia-cliente/duvida  { nome, chassi_final?, mensagem, sessao? }
// A página grava aqui e, em seguida, abre o WhatsApp com a mesma mensagem —
// se a gravação falhar, o cliente ainda consegue falar com a loja.
// =============================================================================
import { NextResponse } from 'next/server';
import { validarDuvida } from '@/lib/garantias/pagina-cliente';
import { gravarDuvida, passouDoLimite, migrationFaltou } from '@/lib/garantias/pagina-cliente-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ipDe(req: Request) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sem-ip';
}

export async function POST(req: Request) {
  if (passouDoLimite(`dv:${ipDe(req)}`, 6, 10 * 60_000)) {
    return NextResponse.json({ ok: false, erro: 'Muitas mensagens seguidas. Tente de novo em alguns minutos.' }, { status: 429 });
  }
  const corpo = await req.json().catch(() => null);
  const v = validarDuvida(corpo);
  if (!v.ok) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400 });
  try {
    await gravarDuvida(v.duvida);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ ok: false, erro: 'indisponível' }, { status: 503 });
    console.error('[garantia-cliente] duvida:', e);
    return NextResponse.json({ ok: false, erro: 'Erro inesperado' }, { status: 500 });
  }
}
