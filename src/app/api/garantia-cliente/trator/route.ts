// =============================================================================
// ROTA PÚBLICA — dados do trator do adesivo (QR por trator). SEM LOGIN.
//
// GET /api/garantia-cliente/trator?c=K7P2QX
//   -> { ok, trator: { codigo, modelo, entrega, chassiFinal, revisoesFeitas } }
// Só o que ajuda o cliente a ver a garantia: sem nome, sem chassi inteiro.
// O código é aleatório (28^6), com freio por IP contra quem tenta adivinhar.
// =============================================================================
import { NextResponse } from 'next/server';
import { normalizarCodigo } from '@/lib/garantias/qr-trator';
import { dadosPublicos, migrationFaltou } from '@/lib/garantias/qr-trator-db';
import { passouDoLimite } from '@/lib/garantias/pagina-cliente-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ipDe(req: Request) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sem-ip';
}

export async function GET(req: Request) {
  if (passouDoLimite(`qr:${ipDe(req)}`, 30)) return NextResponse.json({ ok: false }, { status: 429 });
  const codigo = normalizarCodigo(new URL(req.url).searchParams.get('c'));
  if (!codigo) return NextResponse.json({ ok: false, erro: 'código inválido' }, { status: 400 });
  try {
    const trator = await dadosPublicos(codigo);
    if (!trator) return NextResponse.json({ ok: false, erro: 'não encontrado' }, { status: 404 });
    return NextResponse.json({ ok: true, trator }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (!migrationFaltou(e)) console.error('[garantia-cliente] trator:', e);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
