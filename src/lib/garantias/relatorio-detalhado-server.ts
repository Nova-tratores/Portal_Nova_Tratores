// Relatório detalhado das garantias — leitura do banco (nada vai à Omie).
// Junta garantia + peças (e a nota em que chegaram) + NFS-e de reembolso +
// serviço executado da OS. Regras em relatorio-detalhado.ts.
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, valoresFabrica } from './constants';
import { pagoDaGarantia } from './pago-fabrica';
import { pecasAprovadasDasGarantias, nfseReembolsoDasGarantias, precisaNfseReembolso } from './notas-server';
import { textosDoServico, situacaoDaPeca, repartirPecas, type GarantiaDetalhada, type PecaDetalhe } from './relatorio-detalhado';

type LinhaPeca = {
  id: string; cod_produto: string | null; descricao: string | null; quantidade: number;
  preco_unitario: number | null; resultado: string; forma_reembolso?: string | null;
};
type LinhaG = {
  id: string; numero: string; numero_externo: string | null; id_ordem: string; cliente: string | null;
  chassis: string | null; modelo: string | null; status: string; tecnico_nome: string | null;
  tecnico_horas: number | null; tecnico_km: number | null; garantista_horas: number | null; garantista_km: number | null;
  valor_pago_horas: number | null; valor_pago_km: number | null; valor_pago_pecas: number | null; valor_pago_total: number | null;
  finalizada_em: string | null; created_at: string; checklist_respostas: Record<string, unknown> | null;
  motivo_recusa: string | null; recusado_por: string | null; cobranca_status: string | null; cobranca_valor_total: number | null;
  reembolso_dispensado?: boolean | null;
  fabrica_horas_pagas?: number | null; fabrica_km_pagos?: number | null;
  montadora: { nome: string; valor_hora?: number | null; valor_km?: number | null } | null; pecas: LinhaPeca[] | null;
};

const COLS = 'id, numero, numero_externo, id_ordem, cliente, chassis, modelo, status, tecnico_nome, tecnico_horas, tecnico_km, '
  + 'garantista_horas, garantista_km, valor_pago_horas, valor_pago_km, valor_pago_pecas, valor_pago_total, finalizada_em, created_at, '
  + 'checklist_respostas, motivo_recusa, recusado_por, cobranca_status, cobranca_valor_total, montadora:garantia_montadoras(nome, valor_hora, valor_km)';

async function lerGarantias(ids: string[]): Promise<LinhaG[]> {
  const out: LinhaG[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const ler = (extra: string, pecaExtra: string) => supabase.from(TBL_GARANTIAS)
      .select((COLS + extra + ', pecas:garantia_pecas(id, cod_produto, descricao, quantidade, preco_unitario, resultado' + pecaExtra + ')') as string)
      .in('id', lote);
    let { data, error } = await ler(', reembolso_dispensado, fabrica_horas_pagas, fabrica_km_pagos', ', forma_reembolso');
    if (error && error.code === '42703') ({ data, error } = await ler(', reembolso_dispensado', ', forma_reembolso'));
    if (error && error.code === '42703') ({ data, error } = await ler('', ', forma_reembolso'));
    if (error && error.code === '42703') ({ data, error } = await ler('', ''));
    if (error) throw new Error(error.message);
    out.push(...((data || []) as unknown as LinhaG[]));
  }
  return out;
}

async function lerOS(ordens: string[]) {
  const os = new Map<string, { Serv_Solicitado: string | null; Serv_Realizado: string | null }>();
  const tec = new Map<string, { Motivo: string | null; ServicoRealizado: string | null; TecResp1: string | null }>();
  for (let i = 0; i < ordens.length; i += 150) {
    const lote = ordens.slice(i, i + 150);
    const [a, b] = await Promise.all([
      supabase.from('Ordem_Servico').select('Id_Ordem, Serv_Solicitado, Serv_Realizado').in('Id_Ordem', lote),
      supabase.from('Ordem_Servico_Tecnicos').select('Ordem_Servico, Motivo, ServicoRealizado, TecResp1').in('Ordem_Servico', lote),
    ]);
    for (const o of a.data || []) os.set(o.Id_Ordem, o);
    for (const t of b.data || []) tec.set(t.Ordem_Servico, t);
  }
  return { os, tec };
}

export async function detalharGarantias(ids: string[]): Promise<GarantiaDetalhada[]> {
  const gs = await lerGarantias([...new Set(ids)]);
  if (!gs.length) return [];
  const aprovadas = gs.filter((g) => g.status === 'aprovada');
  const [chegadas, nfses, { os, tec }] = await Promise.all([
    aprovadas.length === 1 ? pecasAprovadasDasGarantias(aprovadas[0].id) : aprovadas.length ? pecasAprovadasDasGarantias() : Promise.resolve([]),
    nfseReembolsoDasGarantias(aprovadas.map((g) => ({
      id: g.id, numero_externo: g.numero_externo, montadora: g.montadora?.nome || null,
      created_at: g.created_at, valor_pago_total: g.valor_pago_total,
    }))),
    lerOS([...new Set(gs.map((g) => g.id_ordem).filter(Boolean))]),
  ]);
  const chegadaPorPeca = new Map(chegadas.flatMap((c) => c.pecas.map((p) => [p.id, p] as const)));

  const ordem = new Map(ids.map((id, i) => [id, i]));
  return gs
    .sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0))
    .map((g) => {
      const aprovada = g.status === 'aprovada';
      const valorHoras = Number(g.valor_pago_horas) || 0;
      const valorKm = Number(g.valor_pago_km) || 0;
      const nfse = nfses.get(g.id);
      const t = tec.get(g.id_ordem);
      const o = os.get(g.id_ordem);
      const valorPecas = Number(g.valor_pago_pecas) || 0;
      const pago = pagoDaGarantia(g, valoresFabrica(g.montadora));
      const pecas: PecaDetalhe[] = (g.pecas || [])
        .filter((p) => !/^MDI/i.test(String(p.cod_produto || '')))
        .map((p) => {
          const c = chegadaPorPeca.get(p.id);
          const forma = c ? (c.forma || c.sugestao) : (p.forma_reembolso === 'paga' || p.forma_reembolso === 'reposta' ? p.forma_reembolso : null);
          const qtd = Number(p.quantidade) || 1;
          return {
            cod: p.cod_produto,
            descricao: p.descricao || '',
            quantidade: qtd,
            valor: Math.round((Number(p.preco_unitario) || 0) * qtd * 100) / 100,
            situacao: situacaoDaPeca({ cod: p.cod_produto, resultado: aprovada ? p.resultado : 'rejeitada', forma, chegou: !!c?.chegou }),
            nota: c?.chegou ? { numero: c.chegou.numero, data: c.chegou.data } : null,
            marcada: !!c?.forma,
            pago: 0,
          };
        });
      const rep = repartirPecas(valorPecas, pecas);
      rep.pago.forEach((v, i) => { pecas[i].pago = v; });
      return {
        id: g.id,
        numero: g.numero,
        sg: g.numero_externo,
        os: g.id_ordem,
        cliente: g.cliente,
        chassi: g.chassis,
        modelo: g.modelo,
        montadora: g.montadora?.nome || null,
        aprovada,
        finalizada_em: g.finalizada_em,
        tecnico: g.tecnico_nome || t?.TecResp1 || null,
        // pagas pela fábrica (informadas da DRVG, senão valor ÷ taxa) × pedidas
        horas: pago.horas.pagas,
        km: pago.km.pagas,
        horasPedidas: pago.horas.pedidas,
        kmPedidos: pago.km.pedidas,
        valorHoras,
        valorKm,
        valorPecas,
        pecasDinheiro: rep.dinheiro,
        pecasReposicaoChegou: rep.chegou,
        pecasReposicaoAChegar: rep.aChegar,
        total: Number(g.valor_pago_total) || 0,
        nfse: nfse
          ? { situacao: 'emitida' as const, numero: nfse.numero, data: nfse.data, confirmada: nfse.como === 'vinculada' }
          : { situacao: aprovada && precisaNfseReembolso(g) ? 'pendente' as const : 'nao_precisa' as const, numero: null, data: null, confirmada: false },
        pecas,
        servico: textosDoServico({
          respostas: g.checklist_respostas, tecnico: t || null,
          servSolicitado: o?.Serv_Solicitado || null, servRealizado: o?.Serv_Realizado || null,
        }),
        motivoRecusa: g.motivo_recusa,
        recusadoPor: g.recusado_por,
        cobranca: { status: g.cobranca_status, valor: g.cobranca_valor_total },
      };
    });
}
