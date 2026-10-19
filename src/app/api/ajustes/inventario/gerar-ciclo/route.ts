import { NextRequest, NextResponse } from 'next/server';
import { gerarCicloEFreeze } from '@/lib/ajustes/inventario';
import { getContasOmie } from '@/lib/ajustes/conta';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Geração manual de um ciclo (+ freeze em background).
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'inventario' }]);
  if (g.resposta) return g.resposta;
  try {
    if (getContasOmie().length === 0) return NextResponse.json({ ok: false, erro: 'Nenhuma conta Omie configurada' }, { status: 400 });
    const b = (await req.json().catch(() => ({}))) as { capacidade?: number; referencia?: string };
    const capacidade = b.capacidade != null ? parseInt(String(b.capacidade), 10) : undefined;
    const resultado = await gerarCicloEFreeze({ tipo: 'manual', capacidade, referencia: b.referencia || undefined, criadoPor: autorDe(g.user) });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
