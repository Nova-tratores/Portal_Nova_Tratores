import { NextRequest, NextResponse } from 'next/server';
import { gerarCicloEFreeze } from '@/lib/ajustes/inventario';
import { getContasOmie } from '@/lib/ajustes/conta';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Geração manual de um ciclo (+ freeze em background).
export async function POST(req: NextRequest) {
  try {
    if (getContasOmie().length === 0) return NextResponse.json({ ok: false, erro: 'Nenhuma conta Omie configurada' }, { status: 400 });
    const b = (await req.json().catch(() => ({}))) as { capacidade?: number; referencia?: string; criadoPor?: string };
    const capacidade = b.capacidade != null ? parseInt(String(b.capacidade), 10) : undefined;
    const resultado = await gerarCicloEFreeze({ tipo: 'manual', capacidade, referencia: b.referencia || undefined, criadoPor: b.criadoPor || 'app-inventario' });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
