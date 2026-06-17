import { NextRequest, NextResponse } from 'next/server';
import { parseConta, getContasOmie, type Conta } from '@/lib/estoque/conta';
import { popularOS } from '@/lib/estoque/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Limpa e repopula os_mensal por conta (foreground). Portado de
// GET /api/popular-os (server.js:1561).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const contasAlvo: Conta[] = conta ? [conta] : getContasOmie().map((c) => c.id);
  if (contasAlvo.length === 0) return NextResponse.json({ erro: 'Nenhuma conta Omie configurada' });
  try {
    const resultados = await popularOS(contasAlvo);
    const totalOS = resultados.reduce((s, r) => s + r.totalOS, 0);
    return NextResponse.json({ ok: true, contas: contasAlvo, totalOS, porConta: resultados });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
