import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { debugListarOS } from '@/lib/estoque/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Classifica OS de um período por etapa (count + soma R$). Portado de
// GET /api/admin/debug-listar-os (server.js:2456).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const de = (sp.get('de') || '').trim();
  const ate = (sp.get('ate') || '').trim();
  const amostraN = parseInt(sp.get('amostra') || '', 10) || 30;
  if (!conta) return NextResponse.json({ erro: 'Informe ?conta=NOVA|CASTRO' });
  if (!de || !ate) return NextResponse.json({ erro: 'Informe ?de=DD/MM/YYYY&ate=DD/MM/YYYY' });
  try {
    return NextResponse.json(await debugListarOS(conta, de, ate, amostraN));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message });
  }
}
