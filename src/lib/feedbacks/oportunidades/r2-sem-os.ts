// R2 — Cliente sem OS recente.
//
// Qualquer cliente nosso (com pelo menos 1 trator vendido pela Nova) que está
// há ≥ M dias sem nenhuma OS na oficina. Independente da quantidade de
// equipamentos — clientes com 1 ou 30 tratores, todos viram oportunidade.
//
// Prioridade: 'Urgente' se nunca teve OS recente OU se ≥ urgente_a_partir_de
// equipamentos.

import { supabase } from "@/lib/supabase";

interface ParametrosR2 {
  min_dias_sem_os?: number;      // default 30
  urgente_a_partir_de?: number;  // default 5 equipamentos → Urgente
}

interface OportunidadeR2 {
  regra: "R2_sem_os";
  codigo_omie: string | null;
  cliente_nome: string;
  trator: null;
  chassis: null;
  detalhes: Record<string, unknown>;
  prioridade: "Urgente" | "Normal";
}

function norm(s: string | null | undefined): string {
  return (s || "").trim().toUpperCase();
}

export async function computarR2(parametros: ParametrosR2 = {}): Promise<OportunidadeR2[]> {
  const minDiasSemOS = parametros.min_dias_sem_os ?? 30;
  const urgenteAt = parametros.urgente_a_partir_de ?? 5;
  const hoje = Date.now();

  // 1) tratores por cliente (todo cliente com pelo menos 1 trator entra)
  const { data: tratores, error: errT } = await supabase.from("tratores").select("Cliente");
  if (errT) throw new Error(`R2 — falha ao ler tratores: ${errT.message}`);

  const countByCliente = new Map<string, number>();
  const nomeOriginal = new Map<string, string>();
  for (const t of (tratores || []) as Array<{ Cliente: string }>) {
    const key = norm(t.Cliente);
    if (!key) continue;
    countByCliente.set(key, (countByCliente.get(key) || 0) + 1);
    if (!nomeOriginal.has(key)) nomeOriginal.set(key, t.Cliente);
  }

  // 2) última OS concluída por cliente (filtrar últimos 2 anos pra reduzir volumetria)
  const limite2anos = new Date(hoje - 2 * 365 * 86400000).toISOString();
  const { data: ordens, error: errO } = await supabase
    .from("Ordem_Servico")
    .select("Os_Cliente, Data_Fim_Servico")
    .not("Data_Fim_Servico", "is", null)
    .gte("Data_Fim_Servico", limite2anos)
    .order("Data_Fim_Servico", { ascending: false });
  if (errO) throw new Error(`R2 — falha ao ler Ordem_Servico: ${errO.message}`);

  const ultimaOSByCliente = new Map<string, string>();
  for (const o of (ordens || []) as Array<{ Os_Cliente: string; Data_Fim_Servico: string }>) {
    const key = norm(o.Os_Cliente);
    if (!key) continue;
    if (!ultimaOSByCliente.has(key)) ultimaOSByCliente.set(key, o.Data_Fim_Servico);
  }

  const mapOmie = await carregarMapaClientes();

  const out: OportunidadeR2[] = [];
  for (const [keyNorm, count] of countByCliente.entries()) {
    const ultimaIso = ultimaOSByCliente.get(keyNorm);
    let diasSemOS: number | null = null;
    if (ultimaIso) {
      diasSemOS = Math.floor((hoje - new Date(ultimaIso).getTime()) / 86400000);
      if (diasSemOS < minDiasSemOS) continue;
    }
    // ultimaIso === undefined → cliente nunca teve OS nos últimos 2 anos

    const semOS = !ultimaIso;
    const prioridade: "Urgente" | "Normal" =
      semOS || count >= urgenteAt ? "Urgente" : "Normal";

    out.push({
      regra: "R2_sem_os",
      codigo_omie: mapOmie.get(keyNorm) ?? null,
      cliente_nome: nomeOriginal.get(keyNorm) || keyNorm,
      trator: null,
      chassis: null,
      prioridade,
      detalhes: {
        total_equipamentos: count,
        ultima_os: ultimaIso ?? null,
        dias_sem_os: diasSemOS,
        sugestao: semOS
          ? `Cliente com ${count} equipamento(s) e SEM OS nos últimos 2 anos — alta prioridade`
          : `Cliente com ${count} equipamento(s) e ${diasSemOS} dias sem OS`,
      },
    });
  }
  return out;
}

async function carregarMapaClientes(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const { data } = await supabase
    .from("Clientes")
    .select("id_omie, nome_fantasia, razao_social");
  for (const c of (data || []) as Array<{ id_omie: string; nome_fantasia: string | null; razao_social: string | null }>) {
    if (c.nome_fantasia) m.set(c.nome_fantasia.trim().toUpperCase(), c.id_omie);
    if (c.razao_social)  m.set(c.razao_social.trim().toUpperCase(),  c.id_omie);
  }
  return m;
}
