// Lê as fontes de km de cada veículo e aplica a regra pura de lib/frota/km.ts.
// Só servidor (service role). 22 carros: calcula na hora, sem cache gravado.
//
// Fontes:
//  - frota_leituras    leituras feitas no portal (foto do painel, oficina, ajuste)
//  - veiculo_checklist km informado no checklist mensal
//  - frota_odometro    odômetro do rastreador (km_adesao > km_rastreador)
//  - frota_dias        km rodado em cada dia (rastreador)
//  - abastecimentos / Requisicao  hodômetro digitado
import type { SupabaseClient } from '@supabase/supabase-js';
import { paginar } from '@/lib/db/paginar';
import { kmAtual, type Leitura, type ResultadoKm, type DiaRastreador, type TipoVeiculo } from '@/lib/frota/km';
import { parseHodometro } from '@/lib/frota/custos';
import { extrairPlacaDeNumPlaca, resolverPlaca } from '@/lib/frota/placa';
import { silhuetaDoVeiculo } from '@/lib/frota/silhueta';

const DIA = 86400_000;
const TIPOS_REQ_VEICULO = ['Veicular Manutenção', 'Veicular Abastecimento', 'Frota-Veículos', 'Frota-Veiculos', 'Serviço de Terceiros'];

export interface KmVeiculo {
  veiculo_id: string;
  placa: string;
  tipo: TipoVeiculo;
  resultado: ResultadoKm;
  /** última leitura humana aceita (âncora) — referência para validar uma nova */
  ancora: { km: number; em: string } | null;
}

export interface LeituraHistorico extends Leitura {
  foto_url?: string | null;
  lido_por?: string | null;
  motivo?: string | null;
}

type Veic = { id: string; placa: string; supa_placa_id: number | string | null; tipo_veiculo: string | null; marca: string | null; modelo: string | null; descricao: string | null };

/** Lê as fontes e devolve o km de cada veículo pedido (ou de todos os veículos). */
export async function carregarKm(
  supabase: SupabaseClient,
  opts: { placas?: string[]; agora?: number } = {},
): Promise<{ porPlaca: Map<string, KmVeiculo>; leituras: Map<string, LeituraHistorico[]>; tabelaLeituras: boolean }> {
  const agora = opts.agora ?? Date.now();
  const iso = (dias: number) => new Date(agora - dias * DIA).toISOString();

  let qv = supabase.from('frota_veiculos')
    .select('id, placa, supa_placa_id, tipo_veiculo, marca, modelo, descricao')
    .eq('tipo_registro', 'veiculo');
  if (opts.placas?.length) qv = qv.in('placa', opts.placas);
  const { data: veics, error: ev } = await qv;
  if (ev) throw new Error(`frota_veiculos: ${ev.message}`);
  const veiculos = (veics || []) as Veic[];
  const ids = veiculos.map((v) => v.id);
  const placas = veiculos.map((v) => v.placa);
  const porSupa = new Map(veiculos.filter((v) => v.supa_placa_id != null).map((v) => [String(v.supa_placa_id), v]));
  if (!ids.length) return { porPlaca: new Map(), leituras: new Map(), tabelaLeituras: true };

  const soPedidos = !!opts.placas?.length;

  const [odo, dias, leit, chk, abast, reqs] = await Promise.all([
    paginar((a, b) => {
      let q = supabase.from('frota_odometro').select('id, veiculo_id, data, km_adesao, km_rastreador').gte('data', iso(40).slice(0, 10));
      if (soPedidos) q = q.in('veiculo_id', ids);
      return q.order('id').range(a, b);
    }),
    paginar((a, b) => {
      let q = supabase.from('frota_dias').select('id, veiculo_id, data, km_odometro, km_total').gte('data', iso(400).slice(0, 10));
      if (soPedidos) q = q.in('veiculo_id', ids);
      return q.order('id').range(a, b);
    }),
    paginar((a, b) => {
      let q = supabase.from('frota_leituras').select('id, placa, lida_em, km, fonte, situacao, foto_url, lido_por, motivo')
        .not('km', 'is', null).gte('lida_em', iso(400));
      if (soPedidos) q = q.in('placa', placas);
      return q.order('id').range(a, b);
    }),
    paginar((a, b) => supabase.from('veiculo_checklist').select('id, placa, km, inicio_em, fim_em, mes_referencia')
      .not('km', 'is', null).gte('inicio_em', iso(400)).order('id').range(a, b)),
    paginar((a, b) => supabase.from('abastecimentos').select('id, placa, hodometro, data_transacao')
      .not('hodometro', 'is', null).gte('data_transacao', iso(180)).order('id').range(a, b)),
    paginar((a, b) => supabase.from('Requisicao').select('id, veiculo, hodometro, data')
      .in('tipo', TIPOS_REQ_VEICULO).neq('status', 'lixeira').not('veiculo', 'is', null).not('hodometro', 'is', null)
      .gte('data', iso(180).slice(0, 10)).order('id').range(a, b)),
  ]);
  // sem a migration frota-leituras: segue sem as leituras do portal
  const tabelaLeituras = !leit.error;

  const humanas = new Map<string, Leitura[]>();
  const digitadas = new Map<string, Leitura[]>();
  const historico = new Map<string, LeituraHistorico[]>();
  const add = <T>(m: Map<string, T[]>, k: string, v: T) => { const a = m.get(k) || []; a.push(v); m.set(k, a); };

  if (tabelaLeituras) {
    for (const l of leit.data as { id: string; placa: string; lida_em: string; km: number; fonte: Leitura['fonte']; situacao: Leitura['situacao']; foto_url: string | null; lido_por: string | null; motivo: string | null }[]) {
      const x: LeituraHistorico = { id: l.id, em: l.lida_em, km: Number(l.km), fonte: l.fonte, situacao: l.situacao, foto_url: l.foto_url, lido_por: l.lido_por, motivo: l.motivo };
      add(humanas, l.placa, x);
      add(historico, l.placa, x);
    }
  }
  for (const c of chk.data as { id: string; placa: string; km: number; inicio_em: string | null; fim_em: string | null; mes_referencia: string }[]) {
    const placa = resolverPlaca(extrairPlacaDeNumPlaca(c.placa));
    if (!placa || !Number(c.km)) continue;
    const x: LeituraHistorico = { id: `chk-${c.id}`, em: c.fim_em || c.inicio_em || `${c.mes_referencia}-01`, km: Number(c.km), fonte: 'checklist' };
    add(humanas, placa, x);
    add(historico, placa, x);
  }
  for (const a of abast.data as { placa: string; hodometro: number | string; data_transacao: string }[]) {
    const km = Number(a.hodometro);
    const placa = resolverPlaca(a.placa);
    if (!placa || !Number.isFinite(km) || km <= 100) continue;
    const x: LeituraHistorico = { em: a.data_transacao, km, fonte: 'abastecimento' };
    add(digitadas, placa, x);
    add(historico, placa, x);
  }
  for (const r of reqs.data as { id: number; veiculo: string | number; hodometro: string; data: string }[]) {
    const v = porSupa.get(String(r.veiculo));
    const km = parseHodometro(r.hodometro);
    if (!v || km == null) continue;
    const x: LeituraHistorico = { id: `req-${r.id}`, em: String(r.data).slice(0, 10), km, fonte: 'requisicao' };
    add(digitadas, v.placa, x);
    add(historico, v.placa, x);
  }

  const odoPorId = new Map<string, { data: string; km: number }>();
  for (const o of odo.data as { veiculo_id: string; data: string; km_adesao: number | null; km_rastreador: number | null }[]) {
    const km = Number(o.km_adesao ?? o.km_rastreador);
    if (!Number.isFinite(km) || km <= 0) continue;
    const atual = odoPorId.get(o.veiculo_id);
    if (!atual || o.data > atual.data) odoPorId.set(o.veiculo_id, { data: o.data, km });
  }
  const diasPorId = new Map<string, DiaRastreador[]>();
  for (const d of dias.data as { veiculo_id: string; data: string; km_odometro: number | null; km_total: number | null }[]) {
    add(diasPorId, d.veiculo_id, { data: d.data, km: Number(d.km_odometro ?? d.km_total) || 0 });
  }

  const porPlaca = new Map<string, KmVeiculo>();
  for (const v of veiculos) {
    const tipo = silhuetaDoVeiculo(v);
    const resultado = kmAtual({
      agora, tipo,
      humanas: humanas.get(v.placa) || [],
      digitadas: digitadas.get(v.placa) || [],
      odometro: odoPorId.get(v.id) || null,
      dias: diasPorId.get(v.id) || [],
    });
    const ancora = resultado.base === 'ancora' && resultado.fonteAncora
      ? ultimaAncora(humanas.get(v.placa) || [], resultado)
      : null;
    porPlaca.set(v.placa, { veiculo_id: v.id, placa: v.placa, tipo, resultado, ancora });
  }
  for (const ls of historico.values()) ls.sort((a, b) => String(b.em).localeCompare(String(a.em)));
  return { porPlaca, leituras: historico, tabelaLeituras };
}

// a âncora usada pelo cálculo (a humana aceita mais recente que não foi ignorada)
function ultimaAncora(humanas: Leitura[], r: ResultadoKm): { km: number; em: string } | null {
  const ignoradas = new Set(r.ignoradas.map((i) => i.leitura));
  const ok = humanas.filter((h) => !ignoradas.has(h) && h.situacao !== 'descartada' && h.situacao !== 'suspeita')
    .sort((a, b) => String(b.em).localeCompare(String(a.em)));
  return ok[0] ? { km: ok[0].km, em: ok[0].em } : null;
}
