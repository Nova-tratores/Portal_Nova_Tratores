// GET /api/frota/resumo — números de combustível da Frota calculados no
// servidor, pela MESMA união da tela de Abastecimento (cartão + requisições já
// no financeiro). Antes a Visão geral lia só o cartão direto do navegador e o
// valor divergia da aba Abastecimento.
//
// Devolve os últimos 30 dias e os 30 dias anteriores (para comparar).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { temModuloFrota } from '@/lib/frota/server';
import { buscarAbastecimentosUniao, resumoCombustivel } from '@/lib/abastecimento/uniao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const DIA = 86400_000;

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  try {
    const agora = Date.now();
    const corte30 = agora - 30 * DIA;
    const inicio60 = new Date(agora - 60 * DIA).toISOString();
    const hoje = new Date(agora).toISOString().slice(0, 10);
    const linhas = await buscarAbastecimentosUniao(supabase, { deIso: inicio60, ate: hoje });
    const ultimos = linhas.filter((l) => new Date(l.data_transacao).getTime() >= corte30);
    const anteriores = linhas.filter((l) => new Date(l.data_transacao).getTime() < corte30);
    return NextResponse.json({
      combustivel: {
        ultimos30: resumoCombustivel(ultimos),
        anteriores30: resumoCombustivel(anteriores),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
