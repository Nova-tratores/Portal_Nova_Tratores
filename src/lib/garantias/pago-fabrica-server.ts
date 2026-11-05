// Grava as horas/km que a fábrica realmente pagou (garantia já aprovada) e
// refaz o dinheiro com a taxa da montadora. Regras em pago-fabrica.ts.
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, valoresFabrica } from './constants';
import { registrarEvento } from './server';
import { fmtMoeda } from './format';
import { novosValoresPagos, pagoDaGarantia } from './pago-fabrica';

const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export async function definirPagoFabrica(id: string, horas: number, km: number, ator: string) {
  if (!(horas >= 0) || !(km >= 0) || horas > 500 || km > 20000) {
    return { ok: false as const, status: 400, erro: 'Horas ou km inválidos.' };
  }
  const ler = (extra: string) => supabase.from(TBL_GARANTIAS)
    .select(('id, status, tecnico_horas, tecnico_km, garantista_horas, garantista_km, valor_pago_horas, valor_pago_km, valor_pago_total, '
      + 'montadora:garantia_montadoras(nome, valor_hora, valor_km)' + extra) as string)
    .eq('id', id).maybeSingle();
  let colunas = true;
  let { data, error } = await ler(', fabrica_horas_pagas, fabrica_km_pagos');
  if (error && error.code === '42703') { colunas = false; ({ data, error } = await ler('')); }
  if (error) return { ok: false as const, status: 500, erro: error.message };
  const g = data as unknown as {
    status: string; tecnico_horas: number | null; tecnico_km: number | null; garantista_horas: number | null; garantista_km: number | null;
    valor_pago_horas: number | null; valor_pago_km: number | null; valor_pago_total: number | null;
    fabrica_horas_pagas?: number | null; fabrica_km_pagos?: number | null;
    montadora: { nome: string; valor_hora: number | null; valor_km: number | null } | null;
  } | null;
  if (!g) return { ok: false as const, status: 404, erro: 'Garantia não encontrada.' };
  if (g.status !== 'aprovada') return { ok: false as const, status: 409, erro: 'Só dá para informar o que a fábrica pagou numa garantia aprovada.' };

  const taxa = valoresFabrica(g.montadora);
  const antes = pagoDaGarantia(g as Parameters<typeof pagoDaGarantia>[0], taxa);
  const novos = novosValoresPagos(g as Parameters<typeof novosValoresPagos>[0], horas, km, taxa);
  const update: Record<string, unknown> = { ...novos };
  if (colunas) { update.fabrica_horas_pagas = horas; update.fabrica_km_pagos = km; }
  const { error: e2 } = await supabase.from(TBL_GARANTIAS).update(update).eq('id', id);
  if (e2) return { ok: false as const, status: 500, erro: e2.message };

  await registrarEvento(id, {
    tipo: 'valores_fabrica',
    ator,
    detalhe: `Pago pela fábrica: ${num(horas)} h de ${num(antes.horas.pedidas)} (antes ${num(antes.horas.pagas)} h) · `
      + `${num(km)} km de ${num(antes.km.pedidas)} (antes ${num(antes.km.pagas)} km) · `
      + `total ${fmtMoeda(Number(g.valor_pago_total) || 0)} → ${fmtMoeda(novos.valor_pago_total)}`,
  });
  return { ok: true as const, ...novos, colunas };
}
