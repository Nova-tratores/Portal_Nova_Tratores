// GET → famílias de produtos (produto_tipo) com contagem, para o seletor da aba
// Produtos do módulo Omie em Massa. `?conta=NOVA|CASTRO` (default NOVA).
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { familiasPorProduto } from '@/lib/omie-massa/supabase';
import { contaDaQuery } from '@/lib/omie-massa/omie';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const permitido = auth.isAdmin || ['ajustes', 'ajustes:omie-massa', 'omie-massa'].some((m) => auth.modulos.includes(m));
  if (!permitido) {
    return NextResponse.json({ error: 'Sem permissão (ajustes:omie-massa)' }, { status: 403 });
  }
  try {
    const fam = await familiasPorProduto(contaDaQuery(new URL(req.url).searchParams.get('conta')));
    const contagem = new Map<string, number>();
    for (const f of fam.values()) contagem.set(f, (contagem.get(f) || 0) + 1);
    const familias = [...contagem.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nome, produtos]) => ({ nome, produtos }));
    return NextResponse.json({ familias });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
