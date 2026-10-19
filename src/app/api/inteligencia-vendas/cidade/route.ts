// /api/inteligencia-vendas/cidade?ibge=3538808&nome=Piraju&lat=-23.19&lng=-49.38
// Raio-x de uma cidade para a ficha do cliente: IBGE (população, PIB, Censo Agro,
// culturas, rebanho, série de 6 anos), previsão do tempo e concorrentes que ganharam de nós.
import { NextResponse } from 'next/server';
import { erroIV, guardarIV } from '@/lib/inteligencia-vendas/server';
import { raioXCidade } from '@/lib/inteligencia-vendas/cidade-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const g = await guardarIV(req);
  if (g.resposta) return g.resposta;
  try {
    const sp = new URL(req.url).searchParams;
    const ibge = Number(sp.get('ibge'));
    if (!Number.isInteger(ibge) || ibge < 1_000_000 || ibge > 9_999_999) return NextResponse.json({ error: 'ibge inválido' }, { status: 400 });
    const num = (k: string) => { const v = sp.get(k); const n = v == null || v === '' ? NaN : Number(v); return Number.isFinite(n) ? n : null; };
    return NextResponse.json(await raioXCidade(ibge, String(sp.get('nome') || '').slice(0, 80), num('lat'), num('lng')));
  } catch (e) {
    return erroIV(e, 'cidade GET');
  }
}
