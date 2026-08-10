import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { listarFamilias, buscarProdutos, listarSemFamilia } from '@/lib/ajustes/familias';

export const dynamic = 'force-dynamic';
// sem_familia=1 varre a Omie (CASTRO ~55 páginas) — precisa de mais tempo.
export const maxDuration = 120;

// GET ?conta=NOVA              -> { familias }
// GET ?conta=NOVA&q=...        -> { familias, produtos }  (busca por SKU/descrição, master local)
// GET ?conta=NOVA&sem_familia=1 -> { familias, produtos }  (sem família, direto da Omie)
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const conta = parseConta(sp.get('conta')) || CONTA_DEFAULT;
    const q = sp.get('q') || '';
    const semFamilia = sp.get('sem_familia') === '1';
    const force = sp.get('atualizar') === '1';
    const [familias, produtos] = await Promise.all([
      listarFamilias(conta),
      semFamilia ? listarSemFamilia(conta, { force }) : buscarProdutos(conta, q),
    ]);
    return NextResponse.json({ familias, produtos });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
