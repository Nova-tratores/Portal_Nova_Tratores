// GET /api/abastecimento/dashboard?de=YYYY-MM-DD&ate=YYYY-MM-DD&filial=&placa=
// Busca uma janela ESTENDIDA (13 meses antes do início, para comparativos
// mês anterior / ano passado, anomalias e projeção), paginada (PostgREST
// limita 1000/request), e agrega em JS (src/lib/abastecimento/agregacoes.ts).
//
// Duas fontes unidas na leitura: `abastecimentos` (CSV do cartão) +
// requisições de abastecimento (Veicular/Trator/Quadri). Trator/Quadri entram
// com as pseudo-placas TRATOR/QUADRI; requisição fica fora do heatmap, dos
// intervalos e do km/l (regras em agregacoes.ts/requisicoes.ts).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { podeFrota } from '@/lib/frota/server';
import { montarDashboard } from '@/lib/abastecimento/agregacoes';
import { buscarAbastecimentosUniao } from '@/lib/abastecimento/uniao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET(req: NextRequest) {
  // Esta rota usava service role e NENHUMA autenticação — qualquer pessoa na
  // internet lia gasto, motorista, posto e placa da empresa.
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'abastecimento')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  try {
    const sp = req.nextUrl.searchParams;
    // default: últimos 12 meses
    const hoje = new Date();
    const ate = sp.get('ate') || hoje.toISOString().slice(0, 10);
    const dePadrao = new Date(hoje);
    dePadrao.setFullYear(dePadrao.getFullYear() - 1);
    const de = sp.get('de') || dePadrao.toISOString().slice(0, 10);
    const filial = sp.get('filial') || '';
    const placa = sp.get('placa') || '';
    const departamento = sp.get('departamento') || '';

    // janela estendida: 13 meses antes do início (comparativo YoY)
    const deExtData = new Date(`${de}T00:00:00-03:00`);
    deExtData.setMonth(deExtData.getMonth() - 13);
    const deExt = deExtData.toISOString();
    const corteJanela = new Date(`${de}T00:00:00-03:00`).getTime();

    const ext = await buscarAbastecimentosUniao(supabase, { deIso: deExt, ate, filial, placa, departamento });

    const janela = ext.filter((l) => new Date(l.data_transacao).getTime() >= corteJanela);
    return NextResponse.json(montarDashboard(janela, ext, { de, ate }, new Date()));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
