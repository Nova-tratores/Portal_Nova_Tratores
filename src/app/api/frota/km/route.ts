// GET /api/frota/km            km atual de todos os veículos (card de Veículos)
// GET /api/frota/km?placa=XXX  km atual de um veículo + histórico de leituras (Ficha / Registrar km)
// Regra "âncora + delta" em src/lib/frota/km.ts; leitura em km-server.ts.
// Aberto também ao módulo "Pendências da frota" (quem registra km no celular).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { temModuloPendencias } from '@/lib/frota/server';
import { carregarKm } from '@/lib/frota/km-server';
import { resolverPlaca } from '@/lib/frota/placa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloPendencias(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  try {
    const bruta = req.nextUrl.searchParams.get('placa');
    if (bruta) {
      const placa = resolverPlaca(bruta);
      const { porPlaca, leituras, tabelaLeituras } = await carregarKm(supabase, { placas: [placa] });
      const k = porPlaca.get(placa);
      if (!k) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
      return NextResponse.json({ ...k, leituras: (leituras.get(placa) || []).slice(0, 30), tabelaLeituras });
    }
    const { porPlaca, tabelaLeituras } = await carregarKm(supabase);
    const km: Record<string, { km: number | null; selo: string; descricao: string; idadeDias: number | null; base: string }> = {};
    for (const [placa, k] of porPlaca) {
      const r = k.resultado;
      km[placa] = { km: r.km, selo: r.selo, descricao: r.descricao, idadeDias: r.idadeDias, base: r.base };
    }
    return NextResponse.json({ km, tabelaLeituras });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
