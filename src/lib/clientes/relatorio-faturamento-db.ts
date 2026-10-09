import { supabaseAdmin } from "@/lib/server/supabase-admin";
import {
  datasBR, brParaIso, nomeTecnico, numero, kmCobradoDosServicos, montarRelatorio,
  type OSFaturada, type PVFaturado, type RelatorioFaturamento,
} from "./relatorio-faturamento";

// Busca no banco e monta o relatório semanal de faturamento (regras em
// relatorio-faturamento.ts). Só servidor.
//
// Fontes:
//  OS  → portal_nt_clientes_os (faturada, data_faturamento no período) +
//        POS Ordem_Servico (técnico) casada por Ordem_Omie/id_omie (sem
//        zeros) = num_os|cod_os + relatório do técnico Ordem_Servico_Tecnicos
//        (TotalKm, TecResp1 — NomResp é o responsável do CLIENTE, não o técnico).
//        Km cobrado = linhas "KM Deslocamento" dos serviços da OS no Omie.
//  PV  → vendas_itens (data_faturamento real, só família "Peças") +
//        portal_nt_clientes_pv (cliente) + técnico: PPV (pedidos.tecnico) →
//        OS que referencia o PV → Balcão.

type Linha = Record<string, unknown>;
const semZeros = (v: unknown) => String(v ?? "").trim().replace(/^0+(?=\d)/, "");
const empresaDaConta = (c: unknown) => (/castro/i.test(String(c)) ? "Castro Pecas" : "Nova Tratores");

async function todas(tabela: string, select: string, filtro: (q: any) => any): Promise<Linha[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Linha[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(supabaseAdmin.from(tabela).select(select)).range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...((data || []) as Linha[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const emLotes = <T,>(arr: T[], n = 150) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export async function gerarRelatorioFaturamento(inicio: string, fim: string): Promise<RelatorioFaturamento> {
  const avisos: string[] = [];

  // ── OS faturadas no período ────────────────────────────────────────────────
  const osOmie = await todas("portal_nt_clientes_os",
    "num_os, cod_os, empresa, cliente_nome, valor_total, vendedor, servicos, data_faturamento",
    q => q.eq("faturada", true).eq("cancelada", false).gte("data_faturamento", inicio).lte("data_faturamento", fim));

  // POS: todas as OS enviadas ao Omie (≈ 800 linhas) — casar pelo nº/código
  const pos = await todas("Ordem_Servico", "Id_Ordem, Ordem_Omie, id_omie, Os_Tecnico, Os_Tecnico2",
    q => q.not("Ordem_Omie", "is", null).neq("Ordem_Omie", ""));
  const posPorChave = new Map<string, Linha>();
  for (const p of pos) {
    for (const k of [p.Ordem_Omie, p.id_omie]) { const c = semZeros(k); if (c) posPorChave.set(c, p); }
  }

  const casados = osOmie.map(o => {
    // cod_os é único entre as contas; nº da OS só vale pra Nova (o POS é da Nova)
    const p = posPorChave.get(String(o.cod_os)) ||
      (empresaDaConta(o.empresa) === "Nova Tratores" ? posPorChave.get(semZeros(o.num_os)) : undefined);
    return { o, p };
  });

  // relatório do técnico (o mais recente por OS do POS)
  const idsPos = [...new Set(casados.map(c => c.p?.Id_Ordem).filter(Boolean) as string[])];
  const relPorOS = new Map<string, Linha>();
  for (const lote of emLotes(idsPos)) {
    const { data } = await supabaseAdmin.from("Ordem_Servico_Tecnicos")
      .select("IdOs, Ordem_Servico, TotalKm, TecResp1").in("Ordem_Servico", lote).order("IdOs", { ascending: false });
    for (const r of data || []) if (!relPorOS.has(String(r.Ordem_Servico))) relPorOS.set(String(r.Ordem_Servico), r);
  }

  const os: OSFaturada[] = casados.map(({ o, p }) => {
    const rel = p ? relPorOS.get(String(p.Id_Ordem)) : undefined;
    const tecnico = nomeTecnico(p?.Os_Tecnico) || nomeTecnico(rel?.TecResp1) || nomeTecnico(o.vendedor);
    // sem relatório do técnico no app → o km do Omie (cobrado na OS) vale como km rodado
    const kmCobrado = kmCobradoDosServicos(o.servicos);
    const kmRel = rel ? numero(rel.TotalKm) : kmCobrado;
    return {
      empresa: empresaDaConta(o.empresa), num_os: String(o.num_os), cod_os: Number(o.cod_os),
      data_faturamento: String(o.data_faturamento).slice(0, 10), cliente: String(o.cliente_nome || ""),
      valor: Number(o.valor_total) || 0, tecnico, tecnico2: nomeTecnico(p?.Os_Tecnico2) || null,
      km_relatorio: kmRel, km_cobrado: kmCobrado,
      km_origem: rel ? "relatorio" : kmCobrado != null ? "omie" : null,
      tem_relatorio: !!rel, pos_id: p ? String(p.Id_Ordem) : null,
    };
  });
  const semPos = os.filter(o => !o.pos_id).length;
  if (semPos) avisos.push(`${semPos} OS faturada(s) sem OS do POS ligada — técnico e km vieram do Omie.`);

  // ── Pedidos de peças faturados no período ──────────────────────────────────
  const itens = await todas("vendas_itens", "numero_pedido, conta_omie, valor_total, data_faturamento, familia",
    q => q.in("data_faturamento", datasBR(inicio, fim)).eq("familia", "Peças"));
  const pedidosMap = new Map<string, { empresa: string; num: string; valor: number; itens: number; data: string }>();
  for (const it of itens) {
    const empresa = empresaDaConta(it.conta_omie);
    const num = semZeros(it.numero_pedido);
    const k = `${empresa}|${num}`;
    const e = pedidosMap.get(k) || { empresa, num, valor: 0, itens: 0, data: brParaIso(String(it.data_faturamento)) };
    e.valor += Number(it.valor_total) || 0; e.itens++;
    pedidosMap.set(k, e);
  }
  const pedidosLista = [...pedidosMap.values()];
  const nums = [...new Set(pedidosLista.map(p => p.num))];

  // cliente (espelho do PV), técnico pelo PPV e pela OS que referencia o PV
  const clientePV = new Map<string, string>();
  const tecPPV = new Map<string, string>();
  const osDoPV = new Map<string, { tec: string; num_os: string }>();
  for (const lote of emLotes(nums)) {
    const [{ data: pvs }, { data: ppvs }, { data: oss }] = await Promise.all([
      supabaseAdmin.from("portal_nt_clientes_pv").select("num_pedido, empresa, cliente_nome").in("num_pedido", lote),
      supabaseAdmin.from("pedidos").select("pedido_omie, omie_empresa, tecnico")
        .in("pedido_omie", [...lote, ...lote.map(n => n.padStart(15, "0"))]),
      supabaseAdmin.from("portal_nt_clientes_os").select("num_os, empresa, vendedor, num_pedido_cli").in("num_pedido_cli", lote),
    ]);
    for (const p of pvs || []) clientePV.set(`${empresaDaConta(p.empresa)}|${semZeros(p.num_pedido)}`, String(p.cliente_nome || ""));
    for (const p of ppvs || []) {
      const t = nomeTecnico(p.tecnico);
      if (t) tecPPV.set(`${empresaDaConta(p.omie_empresa)}|${semZeros(p.pedido_omie)}`, t);
    }
    for (const o of oss || []) {
      const t = nomeTecnico(o.vendedor);
      if (t) osDoPV.set(`${empresaDaConta(o.empresa)}|${semZeros(o.num_pedido_cli)}`, { tec: t, num_os: String(o.num_os) });
    }
  }

  const pv: PVFaturado[] = pedidosLista.map(p => {
    const k = `${p.empresa}|${p.num}`;
    const viaPPV = tecPPV.get(k);
    const viaOS = osDoPV.get(k);
    return {
      empresa: p.empresa, num_pedido: p.num, data_faturamento: p.data, cliente: clientePV.get(k) || "",
      valor_pecas: Math.round(p.valor * 100) / 100, itens: p.itens,
      tecnico: viaPPV || viaOS?.tec || "",
      origem_tecnico: viaPPV ? "ppv" : viaOS ? "os" : "balcao",
      num_os: viaOS?.num_os || null,
    };
  });

  // frescor do espelho de vendas (peças vêm de um sync)
  const { data: ultimo } = await supabaseAdmin.from("vendas_itens").select("created_at").order("created_at", { ascending: false }).limit(1);
  if (ultimo?.[0]?.created_at) {
    const h = (Date.now() - new Date(String(ultimo[0].created_at)).getTime()) / 3600000;
    if (h > 6) avisos.push(`Os pedidos de peças vêm do espelho de vendas, atualizado há ${Math.round(h)} h — o que faturou depois disso ainda não aparece.`);
  }

  return montarRelatorio(inicio, fim, os, pv, avisos);
}
