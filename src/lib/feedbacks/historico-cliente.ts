// Histórico do cliente (códigos Omie, OS, PV, requisições, última OS do
// Portal) — compartilhado entre o navegador (ModalHistoricoCliente e cards,
// via api.ts com o client anon) e o servidor (rota de contexto do cockpit,
// com service role). Todas as funções recebem o client Supabase por parâmetro.

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sb = SupabaseClient<any, any, any>;

// -----------------------------------------------------------------------------
// Códigos Omie do cliente
// -----------------------------------------------------------------------------
// O mesmo cliente pode ter MAIS DE UM cadastro no Omie (caso real: NELSON
// WOLF com 2 id_omie e o mesmo CPF — o PV vivia num código e a oportunidade
// guardou o outro, e o histórico vinha vazio). Resolve TODOS os códigos pelo
// cadastro (mesmo CPF/CNPJ ou mesmo nome) antes de consultar.
export async function codigosDoCliente(sb: Sb, codigoOmie: string | null, nome: string): Promise<string[]> {
  const codigos = new Set<string>();
  if (codigoOmie) codigos.add(String(codigoOmie));
  try {
    let doc: string | null = null;
    if (codigoOmie) {
      const { data } = await sb
        .from("portal_nt_clientes_PRINCIPAL")
        .select("cnpj_cpf")
        .eq("id_omie", codigoOmie)
        .limit(1);
      doc = (data?.[0]?.cnpj_cpf as string | undefined)?.trim() || null;
    }
    const buscas: PromiseLike<unknown>[] = [];
    const coletar = ({ data }: { data: { id_omie: unknown }[] | null }) => {
      for (const r of data || []) if (r.id_omie != null) codigos.add(String(r.id_omie));
    };
    if (doc) {
      buscas.push(sb.from("portal_nt_clientes_PRINCIPAL").select("id_omie").eq("cnpj_cpf", doc).limit(20).then(coletar));
    }
    const nomeTrim = (nome || "").trim();
    if (nomeTrim.length >= 3) {
      // ilike sem % = igualdade sem diferenciar caixa (consultas separadas —
      // nomes com parênteses/vírgula quebrariam um filtro or= composto)
      buscas.push(
        sb.from("portal_nt_clientes_PRINCIPAL").select("id_omie").ilike("nome_fantasia", nomeTrim).limit(20).then(coletar),
        sb.from("portal_nt_clientes_PRINCIPAL").select("id_omie").ilike("razao_social", nomeTrim).limit(20).then(coletar)
      );
    }
    await Promise.allSettled(buscas);
  } catch {
    /* pior caso: fica só o código recebido */
  }
  return [...codigos];
}

/** Desmonta `cliente_key` (`omie_<cod>` | `nome_<NOME>`) nas duas partes. */
export function desmontarClienteKey(key: string): { codigoOmie: string | null; nome: string | null } {
  const k = String(key || "").trim();
  if (k.startsWith("omie_")) return { codigoOmie: k.slice(5) || null, nome: null };
  if (k.startsWith("nome_")) return { codigoOmie: null, nome: k.slice(5) || null };
  return { codigoOmie: null, nome: null };
}

// -----------------------------------------------------------------------------
// Última OS (oficina) por cliente — Ordem_Servico (Portal interno), única fonte
// com nome de técnico (Os_Tecnico). Match por nome do cliente (exato, trim).
// -----------------------------------------------------------------------------
export interface UltimaOS {
  tecnico: string | null;
  data: string | null; // string original (ISO ou DD/MM/YYYY)
  tipo: string | null;
}

/** Timestamp de uma data em ISO ou DD/MM/YYYY (0 se inválida). */
export function tsData(s: string | null | undefined): number {
  if (!s) return 0;
  // Data PURA (YYYY-MM-DD) é lida como LOCAL: `new Date("2026-01-12")` seria
  // UTC e viraria 11/01 no fuso BRT (bug conhecido da Agenda).
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](.+))?$/);
  if (iso) {
    if (!iso[4]) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
    const d = new Date(s);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return 0;
  const [, dd, mm, yyyy, hh = "0", min = "0"] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min)).getTime();
}

export async function buscarUltimasOSPorCliente(sb: Sb, nomes: string[]): Promise<Record<string, UltimaOS>> {
  const unicos = Array.from(new Set(nomes.map((n) => (n || "").trim()).filter(Boolean)));
  if (!unicos.length) return {};
  const acc: Record<string, { ts: number; os: UltimaOS }> = {};
  const LOTE = 50; // não estourar a URL do filtro `in`
  for (let i = 0; i < unicos.length; i += LOTE) {
    const lote = unicos.slice(i, i + LOTE);
    const { data, error } = await sb
      .from("Ordem_Servico")
      .select("Os_Cliente, Os_Tecnico, Os_Tecnico2, Data, Data_Fim_Servico, Tipo_Servico")
      .in("Os_Cliente", lote);
    if (error) throw new Error(error.message || String(error));
    for (const o of (data || []) as Array<Record<string, string | null>>) {
      const cli = (o.Os_Cliente || "").trim();
      if (!cli) continue;
      const ts = Math.max(tsData(o.Data_Fim_Servico), tsData(o.Data));
      const atual = acc[cli];
      if (!atual || ts > atual.ts) {
        acc[cli] = {
          ts,
          os: { tecnico: o.Os_Tecnico || o.Os_Tecnico2 || null, data: o.Data_Fim_Servico || o.Data || null, tipo: o.Tipo_Servico || null },
        };
      }
    }
  }
  const out: Record<string, UltimaOS> = {};
  for (const k of Object.keys(acc)) out[k] = acc[k].os;
  return out;
}

// -----------------------------------------------------------------------------
// Histórico — OS e PV do espelho Omie (por cod_cli) + Requisições (por nome).
// Best-effort: cada fonte falha isolada.
// -----------------------------------------------------------------------------
export interface HistOS {
  num_os: string | null; empresa: string | null; data_inclusao: string | null;
  data_faturamento: string | null; etapa: string | null; status: string | null;
  valor_total: number | null; descricao: string | null; servicos: string | null; num_nf: string | null;
}
export interface HistPV {
  num_pedido: string | null; empresa: string | null; data_inclusao: string | null;
  etapa: string | null; valor_total: number | null; faturado: string | null; numero_nf: string | null;
}
export interface HistReq {
  id: number; titulo: string | null; tipo: string | null; data: string | null;
  status: string | null; fornecedor: string | null; valor_despeza: number | null; ordem_servico: string | null;
}
export interface HistoricoCliente { os: HistOS[]; pv: HistPV[]; requisicoes: HistReq[] }

const SEL_OS = "num_os, empresa, data_inclusao, data_faturamento, etapa, status, valor_total, descricao, servicos, num_nf";
const SEL_PV = "num_pedido, empresa, data_inclusao, etapa, valor_total, faturado, numero_nf";

export async function buscarHistoricoCliente(
  sb: Sb,
  codigoOmie: string | null,
  nome: string,
  codigosJaResolvidos?: string[]
): Promise<HistoricoCliente> {
  const out: HistoricoCliente = { os: [], pv: [], requisicoes: [] };
  const nomeTrim = (nome || "").trim();
  const codigos = codigosJaResolvidos ?? (await codigosDoCliente(sb, codigoOmie, nome));

  const tarefas: PromiseLike<unknown>[] = [];
  if (codigos.length > 0) {
    tarefas.push(
      sb.from("portal_nt_clientes_os").select(SEL_OS)
        .in("cod_cli", codigos).order("data_inclusao", { ascending: false }).limit(100)
        .then(({ data }) => { out.os = (data || []) as HistOS[]; })
    );
    tarefas.push(
      sb.from("portal_nt_clientes_pv").select(SEL_PV)
        .in("cod_cli", codigos).order("data_inclusao", { ascending: false }).limit(100)
        .then(({ data }) => { out.pv = (data || []) as HistPV[]; })
    );
  }
  if (nomeTrim.length >= 3) {
    tarefas.push(
      sb.from("Requisicao")
        .select("id, titulo, tipo, data, status, fornecedor, valor_despeza, ordem_servico")
        .ilike("cliente", `%${nomeTrim}%`).order("id", { ascending: false }).limit(100)
        .then(({ data }) => { out.requisicoes = (data || []) as HistReq[]; })
    );
  }
  await Promise.allSettled(tarefas);

  // Último recurso: nada pelos códigos → tenta pelo NOME nas próprias tabelas
  // de histórico (igualdade case-insensitive, sem curinga — evita homônimo parcial)
  if (nomeTrim.length >= 3 && out.os.length === 0 && out.pv.length === 0) {
    await Promise.allSettled([
      sb.from("portal_nt_clientes_os").select(SEL_OS)
        .ilike("cliente_nome", nomeTrim).order("data_inclusao", { ascending: false }).limit(100)
        .then(({ data }) => { if (data?.length) out.os = data as HistOS[]; }),
      sb.from("portal_nt_clientes_pv").select(SEL_PV)
        .ilike("cliente_nome", nomeTrim).order("data_inclusao", { ascending: false }).limit(100)
        .then(({ data }) => { if (data?.length) out.pv = data as HistPV[]; }),
    ]);
  }
  return out;
}
