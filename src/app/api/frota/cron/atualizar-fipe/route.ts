// Cron MENSAL: atualiza o valor FIPE (Placas.valor_mercado — o patrimônio do
// DRE) de todo veículo que já teve o modelo CONFIRMADO por humano na Ficha
// (fipe_codigo + fipe_ano_codigo gravados). Consulta determinística por
// código — nunca por chute de matching.
//
//   GET  (Bearer CRON_SECRET, ou admin logado)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { buscarFipePorCodigo } from '@/lib/frota/fipe';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || '';

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('atualizar-fipe exige SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  const ehCron = !!CRON_SECRET && header === `Bearer ${CRON_SECRET}`;
  if (!ehCron) {
    const auth = await autenticar(req);
    if (!auth?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = db();
    const { data: veiculos } = await supabase
      .from('frota_veiculos')
      .select('id, placa, id_placa, fipe_codigo, fipe_ano_codigo')
      .eq('tipo_registro', 'veiculo')
      .eq('ativo', true)
      .not('fipe_codigo', 'is', null)
      .not('fipe_ano_codigo', 'is', null)
      .not('id_placa', 'is', null);

    const hoje = new Date().toISOString().slice(0, 10);
    const resumo = { veiculos: (veiculos || []).length, atualizados: 0, erros: [] as string[] };

    for (const v of veiculos || []) {
      try {
        const fipe = await buscarFipePorCodigo(v.fipe_codigo!, v.fipe_ano_codigo!);
        if (!fipe.valor) throw new Error('valor zerado na resposta');
        const { error } = await supabase
          .from('Placas')
          .update({ valor_mercado: fipe.valor, data_valor: hoje })
          .eq('IdPlaca', v.id_placa);
        if (error) throw new Error(error.message);
        resumo.atualizados++;
        // gentileza com a API pública
        await new Promise((r) => setTimeout(r, 600));
      } catch (e) {
        resumo.erros.push(`${v.placa}: ${e instanceof Error ? e.message : e}`);
      }
    }

    console.log('[frota] atualizar-fipe OK:', JSON.stringify(resumo));
    return NextResponse.json({ ok: resumo.erros.length === 0, resumo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[frota] atualizar-fipe FALHOU:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
