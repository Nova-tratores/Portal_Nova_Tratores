// Lê planos, serviços feitos, km e horas de motor e calcula a situação de cada
// item de preventiva de cada veículo (regra pura em lib/frota/preventiva.ts).
// Só servidor. Usado por /api/frota/preventivas, pela aba Hoje e pelo motor de
// pendências (que abre a pendência "Preventiva: …" quando vence em breve).
import type { SupabaseClient } from '@supabase/supabase-js';
import { paginar } from '@/lib/db/paginar';
import { carregarKm, type KmVeiculo } from '@/lib/frota/km-server';
import {
  situacaoPreventiva, resumirPreventivas,
  type ItemPlano, type ServicoFeito, type SituacaoPreventiva, type ResumoPreventivas,
} from '@/lib/frota/preventiva';

export interface ModeloManutencao {
  id: string; nome: string; manual_url: string | null; manual_referencia: string | null; obs: string | null;
}
export interface ItemSituacao {
  plano: ItemPlano;
  ultimo: (ServicoFeito & { id: string; origem: string; obs: string | null; criado_por: string | null }) | null;
  situacao: SituacaoPreventiva;
}
export interface PreventivaVeiculo {
  veiculo_id: string;
  placa: string;
  descricao: string;
  modelo: ModeloManutencao | null;
  km: KmVeiculo | null;
  itens: ItemSituacao[];
}
export interface ResultadoPreventivas {
  /** false = migration sql/frota-preventiva.sql ainda não aplicada */
  tabela: boolean;
  veiculos: PreventivaVeiculo[];
  resumo: ResumoPreventivas;
  kmPorPlaca: Map<string, KmVeiculo>;
}

const semTabela = (m: string) => /frota_modelos_manutencao|frota_planos|frota_servicos|modelo_manutencao_id|does not exist|schema cache/i.test(m);

export async function calcularPreventivas(
  supabase: SupabaseClient,
  opts: { placas?: string[]; agora?: number } = {},
): Promise<ResultadoPreventivas> {
  const agora = opts.agora ?? Date.now();
  const kmP = carregarKm(supabase, { placas: opts.placas, agora });

  let qv = supabase.from('frota_veiculos')
    .select('id, placa, marca, modelo, descricao, ativo, status, tipo_registro, modelo_manutencao_id')
    .eq('tipo_registro', 'veiculo');
  if (opts.placas?.length) qv = qv.in('placa', opts.placas);
  const [veics, modelos, planos] = await Promise.all([
    qv,
    supabase.from('frota_modelos_manutencao').select('id, nome, manual_url, manual_referencia, obs'),
    supabase.from('frota_planos').select('id, modelo_id, nome, componente_id, intervalo_km, intervalo_horas, intervalo_meses, aviso_km, aviso_horas, aviso_dias, modo, referencia, ordem')
      .eq('ativo', true).order('ordem').order('nome'),
  ]);
  const km = await kmP;
  const vazio: ResultadoPreventivas = { tabela: false, veiculos: [], resumo: resumirPreventivas([]), kmPorPlaca: km.porPlaca };
  if (veics.error || modelos.error || planos.error) {
    const msg = (veics.error || modelos.error || planos.error)!.message;
    if (semTabela(msg)) return vazio;
    throw new Error(msg);
  }

  type V = { id: string; placa: string; marca: string | null; modelo: string | null; descricao: string | null; ativo: boolean | null; status: string | null; modelo_manutencao_id: string | null };
  const veiculos = ((veics.data || []) as V[]).filter((v) => v.ativo && v.status !== 'vendido');
  const ids = veiculos.map((v) => v.id);

  const servicos = ids.length ? await paginar((a, b) => {
    let q = supabase.from('frota_servicos').select('id, veiculo_id, plano_id, data, km, horas_motor, origem, obs, criado_por')
      .not('plano_id', 'is', null);
    if (opts.placas?.length) q = q.in('veiculo_id', ids);
    return q.order('data', { ascending: false }).order('id').range(a, b);
  }) : { data: [], error: null };
  if (servicos.error) {
    if (semTabela(servicos.error.message)) return vazio;
    throw new Error(servicos.error.message);
  }
  // último serviço de cada veículo × item (a lista já vem do mais novo)
  type S = { id: string; veiculo_id: string; plano_id: string; data: string; km: number | null; horas_motor: number | null; origem: string; obs: string | null; criado_por: string | null };
  const ultimo = new Map<string, S>();
  for (const s of servicos.data as S[]) {
    const k = `${s.veiculo_id}|${s.plano_id}`;
    if (!ultimo.has(k)) ultimo.set(k, s);
  }

  // horas de motor (só se algum item usa horas): soma do tempo ligado por dia
  const usaHoras = (planos.data || []).some((p) => p.intervalo_horas);
  const minutosPorDia = new Map<string, { data: string; min: number }[]>();
  if (usaHoras && ids.length) {
    const dias = await paginar((a, b) => supabase.from('frota_dias').select('id, veiculo_id, data, tempo_ligado_min')
      .in('veiculo_id', ids).gte('data', new Date(agora - 800 * 86400_000).toISOString().slice(0, 10)).order('id').range(a, b));
    for (const d of dias.data as { veiculo_id: string; data: string; tempo_ligado_min: number | null }[]) {
      const arr = minutosPorDia.get(d.veiculo_id) || [];
      arr.push({ data: d.data, min: Number(d.tempo_ligado_min) || 0 });
      minutosPorDia.set(d.veiculo_id, arr);
    }
  }
  const horasDesde = (veiculoId: string, data: string): number | null => {
    const ds = minutosPorDia.get(veiculoId);
    if (!ds?.length) return null;
    return Math.round(ds.filter((d) => d.data > data.slice(0, 10)).reduce((s, d) => s + d.min, 0) / 60);
  };

  const modeloPorId = new Map(((modelos.data || []) as ModeloManutencao[]).map((m) => [m.id, m]));
  const planosPorModelo = new Map<string, (ItemPlano & { modelo_id: string })[]>();
  for (const p of (planos.data || []) as (ItemPlano & { modelo_id: string })[]) {
    const arr = planosPorModelo.get(p.modelo_id) || [];
    arr.push(p); planosPorModelo.set(p.modelo_id, arr);
  }

  const out: PreventivaVeiculo[] = [];
  const estados: SituacaoPreventiva['estado'][] = [];
  for (const v of veiculos) {
    const modelo = v.modelo_manutencao_id ? modeloPorId.get(v.modelo_manutencao_id) || null : null;
    const k = km.porPlaca.get(v.placa) || null;
    const kmAtual = k?.resultado.km ?? null;
    const kmIncerto = !k || k.resultado.selo === 'vermelho' || k.resultado.selo === 'cinza';
    const itens: ItemSituacao[] = (modelo ? planosPorModelo.get(modelo.id) || [] : []).map((plano) => {
      const u = ultimo.get(`${v.id}|${plano.id}`) || null;
      const ult = u ? { ...u, km: u.km != null ? Number(u.km) : null, horas_motor: u.horas_motor != null ? Number(u.horas_motor) : null } : null;
      const situacao = situacaoPreventiva(plano, ult, {
        agora, kmAtual, kmIncerto, horasDesdeUltimo: ult && plano.intervalo_horas ? horasDesde(v.id, ult.data) : null,
      });
      estados.push(situacao.estado);
      return { plano, ultimo: ult, situacao };
    });
    out.push({
      veiculo_id: v.id, placa: v.placa,
      descricao: [v.marca, v.modelo || v.descricao].filter(Boolean).join(' '),
      modelo, km: k, itens,
    });
  }
  return { tabela: true, veiculos: out, resumo: resumirPreventivas(estados), kmPorPlaca: km.porPlaca };
}
