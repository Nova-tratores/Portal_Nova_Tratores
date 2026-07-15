// POST /api/frota/multas/atualizar — sincroniza os EVENTOS da Rota Exata
// (multas/manutenções/custos) sob demanda, chamado quando a aba de Multas
// abre. TRAVA de 10 minutos: se o último sync (max visto_em) é recente,
// responde na hora sem tocar na API externa — abrir a aba dez vezes seguidas
// custa um sync só. Requisições simultâneas compartilham a mesma execução.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { temModuloFrota } from '@/lib/frota/server';
import { syncEventos } from '@/lib/frota/sync';

export const runtime = 'nodejs';
export const maxDuration = 300;

const FRESCOR_MS = 10 * 60 * 1000;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

// Lock best-effort por instância: aberturas simultâneas esperam o mesmo sync.
let emAndamento: Promise<Record<string, number>> | null = null;

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const { data } = await supabase
    .from('frota_multas')
    .select('visto_em')
    .order('visto_em', { ascending: false })
    .limit(1);
  const ultimo = data?.[0]?.visto_em ? Date.parse(String(data[0].visto_em)) : 0;
  if (Date.now() - ultimo < FRESCOR_MS) {
    return NextResponse.json({ ok: true, sincronizou: false, ultimoSync: data?.[0]?.visto_em ?? null });
  }

  try {
    if (!emAndamento) {
      emAndamento = syncEventos().finally(() => { emAndamento = null; });
    }
    const resumo = await emAndamento;
    return NextResponse.json({ ok: true, sincronizou: true, resumo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[frota] multas/atualizar FALHOU:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
