// Helper unificado de OSs — lê de DUAS fontes e devolve índice combinado:
//   1. Ordem_Servico (Portal interno) — OSs criadas via Portal
//   2. ordens_servico_relatorio (sync Omie) — OSs criadas direto no Omie
//
// Sem isso, R1 e R2 enxergam só o subconjunto de OSs do Portal interno e
// marcam erroneamente como "sem OS" clientes que têm histórico longo no Omie.

import { supabase } from "@/lib/supabase";
import { lerTudo } from "./_paginar";
import { parseDataBR } from "./_pedidos";

export interface OSInfo {
  data: Date;
  id_ordem: string | null;       // numero_os no Omie, Id_Ordem no Portal
  tipo_servico: string | null;   // só preenchido pelo Portal interno
  fonte: "portal" | "omie";
  empresa: string | null;        // NOVA/CASTRO (só Omie)
}

export interface IndiceOS {
  porChassi: Map<string, OSInfo>;    // chassi normalizado → última OS conhecida
  porCliente: Map<string, OSInfo>;   // cliente_norm → última OS conhecida
}

function norm(s: string | null | undefined): string {
  return (s || "").trim().toUpperCase();
}

// Tenta extrair Date de um valor que pode vir como ISO (Portal) ou DD/MM/YYYY (Omie)
function parseData(s: string | null | undefined): Date | null {
  if (!s) return null;
  // ISO YYYY-MM-DD ou ISO timestamp
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // DD/MM/YYYY [HH:MM]
  return parseDataBR(s);
}

function setSeMaisRecente(map: Map<string, OSInfo>, key: string, info: OSInfo) {
  const atual = map.get(key);
  if (!atual || info.data > atual.data) map.set(key, info);
}

// Match por chassi via substring no campo "projeto" (Ordem_Servico.Projeto ou
// ordens_servico_relatorio.nome_projeto). Ambos vêm como "MODELO TAG CHASSI".
// Recebemos um array de tratores com chassi conhecido pra fazer o lookup.
export async function carregarIndiceOSCompleto(chassisConhecidos: string[]): Promise<IndiceOS> {
  const porChassi = new Map<string, OSInfo>();
  const porCliente = new Map<string, OSInfo>();
  const chassisUpper = chassisConhecidos.map((c) => c.trim().toUpperCase()).filter(Boolean);

  function matchChassi(projeto: string | null | undefined): string | null {
    if (!projeto) return null;
    const projUp = projeto.toUpperCase();
    for (const chassi of chassisUpper) {
      if (projUp.includes(chassi)) return chassi;
    }
    return null;
  }

  // ===== 1) Ordem_Servico (Portal interno) =====
  const limite2anos = new Date(Date.now() - 2 * 365 * 86400000).toISOString();
  const ordensPortal = await lerTudo<{
    Id_Ordem: string | null;
    Os_Cliente: string | null;
    Data: string | null;
    Data_Fim_Servico: string | null;
    Projeto: string | null;
    Tipo_Servico: string | null;
  }>((from, to) =>
    supabase
      .from("Ordem_Servico")
      .select("Id_Ordem, Os_Cliente, Data, Data_Fim_Servico, Projeto, Tipo_Servico")
      .gte("Data", limite2anos)
      .range(from, to)
  );

  for (const o of ordensPortal) {
    const d = parseData(o.Data_Fim_Servico || o.Data);
    if (!d) continue;
    const info: OSInfo = {
      data: d,
      id_ordem: o.Id_Ordem,
      tipo_servico: o.Tipo_Servico,
      fonte: "portal",
      empresa: null,
    };
    const cli = norm(o.Os_Cliente);
    if (cli) setSeMaisRecente(porCliente, cli, info);
    const chassi = matchChassi(o.Projeto);
    if (chassi) setSeMaisRecente(porChassi, chassi, info);
  }

  // ===== 2) ordens_servico_relatorio (Omie) =====
  const ordensOmie = await lerTudo<{
    numero_os: string | null;
    nome_cliente: string | null;
    nome_projeto: string | null;
    data_abertura: string | null;
    data_emissao: string | null;
    nome_etapa: string | null;
    status_cancelada: string | null;
    empresa: string | null;
  }>((from, to) =>
    supabase
      .from("ordens_servico_relatorio")
      .select("numero_os, nome_cliente, nome_projeto, data_abertura, data_emissao, nome_etapa, status_cancelada, empresa")
      .range(from, to)
  );

  for (const o of ordensOmie) {
    if ((o.status_cancelada || "").toLowerCase() === "sim") continue;
    const d = parseData(o.data_abertura || o.data_emissao);
    if (!d) continue;
    const info: OSInfo = {
      data: d,
      id_ordem: o.numero_os,
      tipo_servico: o.nome_etapa,  // não temos Tipo_Servico no Omie, usa a etapa como contexto
      fonte: "omie",
      empresa: o.empresa,
    };
    const cli = norm(o.nome_cliente);
    if (cli) setSeMaisRecente(porCliente, cli, info);
    const chassi = matchChassi(o.nome_projeto);
    if (chassi) setSeMaisRecente(porChassi, chassi, info);
  }

  return { porChassi, porCliente };
}
