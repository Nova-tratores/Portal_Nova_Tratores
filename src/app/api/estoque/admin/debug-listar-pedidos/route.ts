import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { debugListarPedidos } from '@/lib/estoque/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Chamada bruta a ListarPedidos classificando tudo (só leitura). Portado de
// GET /api/admin/debug-listar-pedidos (server.js:2348).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const de = (sp.get('de') || '').trim();
  const ate = (sp.get('ate') || '').trim();
  const amostraN = parseInt(sp.get('amostra') || '', 10) || 30;
  if (!conta) return NextResponse.json({ erro: 'Informe ?conta=NOVA|CASTRO' });
  if (!de || !ate) return NextResponse.json({ erro: 'Informe ?de=DD/MM/YYYY&ate=DD/MM/YYYY' });
  try {
    return NextResponse.json(await debugListarPedidos(conta, de, ate, amostraN));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message });
  }
}
