// UNIÃO das duas fontes de abastecimento, lida no servidor (service role):
//  1) `abastecimentos` — CSV do cartão-frota
//  2) requisições de abastecimento já no FINANCEIRO (Veicular/Trator/Quadri),
//     com as pseudo-placas TRATOR/QUADRI para quem não tem placa
// Usada pelo dashboard de Abastecimento e pelos números da Frota — os dois
// lugares precisam somar a MESMA coisa (antes a Visão geral só lia o cartão).
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizarDepartamento, calcularTotais, type LinhaDash } from '@/lib/abastecimento/agregacoes';
import { buscarReqsAbastecimento, PLACA_QUADRI, PLACA_TRATOR } from '@/lib/abastecimento/requisicoes';
import { ehAvulsa, resolverPlaca } from '@/lib/frota/placa';

const COLS =
  'placa, id_placa, modelo_veiculo, filial_nome, motorista_nome, posto_nome, posto_cidade, combustivel, litros, valor_total, valor_economizado, hodometro, data_transacao, capacidade_tanque, ordem_servico, departamento';

const PAGINA = 1000;

export type FiltrosUniao = {
  /** início, ISO com hora (o cartão grava timestamp) */
  deIso: string;
  /** fim, YYYY-MM-DD (inclusive, até 23:59:59 BRT) */
  ate: string;
  filial?: string;
  placa?: string;
  departamento?: string;
};

export async function buscarAbastecimentosUniao(supabase: SupabaseClient, f: FiltrosUniao): Promise<LinhaDash[]> {
  const out: LinhaDash[] = [];
  for (let off = 0; ; off += PAGINA) {
    let q = supabase
      .from('abastecimentos')
      .select(COLS)
      .gte('data_transacao', f.deIso)
      .lte('data_transacao', `${f.ate}T23:59:59-03:00`)
      .order('data_transacao', { ascending: true })
      .order('id', { ascending: true }) // desempate estável na virada da página
      .range(off, off + PAGINA - 1);
    if (f.filial) q = q.eq('filial_nome', f.filial);
    if (f.placa) q = q.eq('placa', f.placa);
    // departamento: filtro em JS depois de canonizar ("COMERCIAL" do cartão
    // e "Comercial" da requisição são o mesmo setor — .eq no banco só
    // acharia uma das grafias)
    const { data, error } = await q;
    if (error) throw new Error(`abastecimentos: ${error.message}`);
    const lote = (data || []) as unknown as LinhaDash[];
    for (const l of lote) {
      const dep = normalizarDepartamento(l.departamento);
      if (f.departamento && dep !== f.departamento) continue;
      out.push({
        ...l,
        departamento: dep,
        litros: Number(l.litros) || 0,
        valor_total: l.valor_total == null ? null : Number(l.valor_total),
        hodometro: l.hodometro == null ? null : Number(l.hodometro),
        capacidade_tanque: l.capacidade_tanque == null ? null : Number(l.capacidade_tanque),
      });
    }
    if (lote.length < PAGINA) break;
  }

  const reqs = (await buscarReqsAbastecimento(supabase, f.deIso.slice(0, 10), f.ate)).filter((r) => {
    if (f.filial && r.filial_nome !== f.filial) return false;
    if (f.placa && r.placa !== f.placa) return false;
    if (f.departamento && normalizarDepartamento(r.departamento) !== f.departamento) return false;
    return true;
  });
  for (const r of reqs) {
    out.push({
      placa: r.placa,
      id_placa: r.id_placa,
      // nos rankings/selects, o agregado TRATOR/QUADRI ganha um rótulo fixo
      // (o chassis por linha continua visível na aba Transações)
      modelo_veiculo:
        r.placa === PLACA_TRATOR ? 'Tratores (requisições)'
        : r.placa === PLACA_QUADRI ? 'Quadriciclos (requisições)'
        : r.modelo_veiculo,
      filial_nome: r.filial_nome,
      motorista_nome: r.motorista_nome,
      posto_nome: r.posto_nome,
      posto_cidade: r.posto_cidade,
      combustivel: r.combustivel,
      litros: r.litros,
      valor_total: r.valor_total,
      hodometro: r.hodometro,
      data_transacao: r.data_transacao,
      capacidade_tanque: r.capacidade_tanque,
      ordem_servico: r.ordem_servico,
      departamento: normalizarDepartamento(r.departamento),
      origem: 'requisicao',
    });
  }
  // ordena por tempo real (cartão vem em UTC, requisição em -03:00 — string não serve)
  out.sort((a, b) => new Date(a.data_transacao).getTime() - new Date(b.data_transacao).getTime());
  return out;
}

/** Só os veículos da frota: tira os baldes avulsos do cartão (clientes,
 *  tratores, quadriciclos) e as pseudo-placas TRATOR/QUADRI das requisições. */
export function somenteFrota(linhas: LinhaDash[]): LinhaDash[] {
  return linhas.filter((l) => {
    if (l.placa === PLACA_TRATOR || l.placa === PLACA_QUADRI) return false;
    const p = resolverPlaca(l.placa);
    return !!p && !ehAvulsa(p);
  });
}

/** Gasto, litros e quantidade de abastecimentos dos veículos da frota no período. */
export function resumoCombustivel(linhas: LinhaDash[]): { gasto: number; litros: number; abastecimentos: number } {
  const t = calcularTotais(somenteFrota(linhas));
  return { gasto: t.valor, litros: t.litros, abastecimentos: t.transacoes };
}
