// =============================================================================
// ROTA PÚBLICA — uso da página da garantia (QR code). SEM LOGIN.
//
// POST /api/garantia-cliente/evento  { tipo, valor?, sessao? }
// Só aceita os tipos conhecidos, corta o texto e tem freio por IP. Responde
// 204 mesmo quando não grava (migration pendente): a página nunca trava por isso.
// =============================================================================
import { validarEvento } from '@/lib/garantias/pagina-cliente';
import { gravarEvento, passouDoLimite, migrationFaltou } from '@/lib/garantias/pagina-cliente-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ipDe(req: Request) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sem-ip';
}

export async function POST(req: Request) {
  if (passouDoLimite(`ev:${ipDe(req)}`, 120)) return new Response(null, { status: 429 });
  // sendBeacon manda text/plain: lê como texto e interpreta
  const corpo = await req.text().then((t) => { try { return JSON.parse(t); } catch { return null; } });
  const evento = validarEvento(corpo);
  if (!evento) return new Response(null, { status: 400 });
  try {
    await gravarEvento(evento);
  } catch (e) {
    if (!migrationFaltou(e)) console.error('[garantia-cliente] evento:', e);
  }
  return new Response(null, { status: 204 });
}
