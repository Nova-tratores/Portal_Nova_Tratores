// R1 — Oportunidade de revisão por horímetro/garantia.
//
// Reusa calcularPrevisao() do módulo de revisões: estima quando o trator vai
// bater na próxima revisão obrigatória com base no horímetro médio diário.
// Vira oportunidade quando:
//   - próxima revisão é uma das de garantia (50h, 300h, 600h por default)
//   - data estimada cai dentro da janela `dias_anteced` futura OU já está atrasada
//   - E NÃO há OS de revisão registrada em Ordem_Servico depois da última
//     revisão conhecida (correlação adicional caso tratores.50h Data não tenha
//     sido atualizado mas a revisão tenha acontecido)
//
// Prioridade: 'Urgente' se atrasada, 'Normal' caso contrário.

import { supabase } from "@/lib/supabase";
import { calcularPrevisao } from "@/lib/revisoes/utils";
import { REVISOES_LISTA, type Trator } from "@/lib/revisoes/types";

// Reproduz a lógica interna de calcularPrevisao para extrair a data da última
// revisão registrada (a função original não expõe esse campo).
function extrairUltimaRevData(t: Trator): Date {
  let last = new Date(t.Entrega);
  for (const rev of REVISOES_LISTA) {
    const d = t[`${rev} Data` as keyof Trator] as string | undefined;
    const hRaw = t[`${rev} Horimetro` as keyof Trator] as string | undefined;
    const h = hRaw ? parseFloat(hRaw) : NaN;
    if (d && !isNaN(h)) last = new Date(d);
  }
  return last;
}

interface ParametrosR1 {
  revisoes_alvo?: number[];   // default [50, 300, 600]
  dias_anteced?: number;      // default 15
}

interface OportunidadeR1 {
  regra: "R1_revisao";
  codigo_omie: string | null;
  cliente_nome: string;
  trator: string | null;
  chassis: string | null;
  detalhes: Record<string, unknown>;
  prioridade: "Urgente" | "Normal";
}

function norm(s: string | null | undefined): string {
  return (s || "").trim().toUpperCase();
}

// Carrega OSs com Tipo_Servico relacionado a revisão/garantia dos últimos 2 anos
// e indexa por cliente normalizado + chassi (Projeto). Usado para detectar quando
// uma revisão foi feita sem que `tratores.*h Data` tenha sido atualizado.
interface IndiceOS {
  porChassi: Map<string, string>;        // chassi → última data ISO de OS de revisão
  porCliente: Map<string, string>;       // cliente_norm → última data ISO
}

async function carregarIndiceOSRevisao(): Promise<IndiceOS> {
  const limite2anos = new Date(Date.now() - 2 * 365 * 86400000).toISOString();
  const { data, error } = await supabase
    .from("Ordem_Servico")
    .select("Os_Cliente, Data, Data_Fim_Servico, Tipo_Servico, Projeto")
    .not("Data_Fim_Servico", "is", null)
    .gte("Data_Fim_Servico", limite2anos);
  if (error) throw new Error(`R1 — falha ao ler Ordem_Servico: ${error.message}`);

  const porChassi = new Map<string, string>();
  const porCliente = new Map<string, string>();

  for (const o of (data || []) as Array<{
    Os_Cliente: string | null;
    Data: string | null;
    Data_Fim_Servico: string | null;
    Tipo_Servico: string | null;
    Projeto: string | null;
  }>) {
    const tipo = (o.Tipo_Servico || "").toLowerCase();
    // Heurística: contar OS de revisão/garantia/manutenção preventiva.
    // Manutenção corretiva fica de fora — não substitui a revisão obrigatória.
    const ehRevisao =
      tipo.includes("revis") || tipo.includes("garant") || tipo.includes("preventiv");
    if (!ehRevisao) continue;

    const data = o.Data_Fim_Servico || o.Data;
    if (!data) continue;

    const chassi = (o.Projeto || "").trim();
    if (chassi) {
      const atual = porChassi.get(chassi);
      if (!atual || data > atual) porChassi.set(chassi, data);
    }
    const cli = norm(o.Os_Cliente);
    if (cli) {
      const atual = porCliente.get(cli);
      if (!atual || data > atual) porCliente.set(cli, data);
    }
  }

  return { porChassi, porCliente };
}

export async function computarR1(parametros: ParametrosR1 = {}): Promise<OportunidadeR1[]> {
  const revisoesAlvo = parametros.revisoes_alvo ?? [50, 300, 600];
  const diasAnteced = parametros.dias_anteced ?? 15;
  const hoje = new Date();
  const limiteFuturo = new Date(hoje.getTime() + diasAnteced * 86400000);

  const { data: tratores, error } = await supabase.from("tratores").select("*");
  if (error) throw new Error(`R1 — falha ao ler tratores: ${error.message}`);

  const mapClienteOmie = await carregarMapaClientes();
  const indiceOS = await carregarIndiceOSRevisao();

  const out: OportunidadeR1[] = [];
  for (const t of (tratores || []) as Trator[]) {
    if (!t.Entrega || !t.Cliente) continue;

    let prev;
    try { prev = calcularPrevisao(t); } catch { continue; }

    if (!revisoesAlvo.includes(prev.proximaRevHoras)) continue;

    const dentroDaJanela = prev.dataEstimada <= limiteFuturo;
    if (!prev.atrasada && !dentroDaJanela) continue;

    // Verificar se existe OS de revisão em Ordem_Servico depois da última
    // revisão registrada no trator. Se sim, considera que a revisão foi feita
    // (mesmo que tratores.{rev} Data não tenha sido preenchido).
    const ultimaRevDataReal = extrairUltimaRevData(t).toISOString();

    const chassi = (t.Chassis || "").trim();
    const cliNorm = norm(t.Cliente);
    const osPorChassi = chassi ? indiceOS.porChassi.get(chassi) : undefined;
    const osPorCliente = indiceOS.porCliente.get(cliNorm);
    // Match por chassi é mais confiável; cliente é fallback (best-effort)
    const ultimaOSRevisao = osPorChassi || osPorCliente;

    if (ultimaOSRevisao && ultimaOSRevisao > ultimaRevDataReal) {
      // Já houve OS de revisão depois da última registrada — pular
      continue;
    }

    const codigoOmie = mapClienteOmie.get(cliNorm) ?? null;

    out.push({
      regra: "R1_revisao",
      codigo_omie: codigoOmie,
      cliente_nome: t.Cliente,
      trator: `${t.Modelo || ""} — ${t.Chassis || ""}`.trim(),
      chassis: t.Chassis || null,
      prioridade: prev.atrasada ? "Urgente" : "Normal",
      detalhes: {
        revisao_alvo: `${prev.proximaRevHoras}h`,
        data_estimada: prev.dataEstimada.toISOString(),
        ultima_revisao_horas: prev.ultimaRevHoras,
        media_horas_dia: prev.mediaHorasDia,
        modelo: t.Modelo,
        cidade: t.Cidade,
        vendedor: t.Vendedor,
        atrasada: prev.atrasada,
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
