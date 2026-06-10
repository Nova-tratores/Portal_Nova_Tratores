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
import { lerTudo } from "./_paginar";
import { carregarIndiceOSCompleto } from "./_os";

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
  revisoes_alvo?: number[];        // default [50, 300, 600]
  dias_anteced?: number;           // default 15
  dias_primeira_revisao?: number;  // default 50 — 1ª revisão por tempo (trator novo)
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

// Carrega TODAS as OSs (qualquer Tipo_Servico) dos últimos 2 anos.
//
// Usa `Data` (abertura) como filtro principal — muitas OSs no banco têm
// `Data_Fim_Servico` NULL (oficina não preenche sempre). Considera abertura
// como evidência suficiente de atividade.
//
// Match com Chassis é por substring: `Ordem_Servico.Projeto` vem como
// "6075 CBU MBNYHBKYVNNJ02213" enquanto `tratores.Chassis` é só
// "MBNYHBKYVNNJ02213" — então igualdade direta nunca bate.
// Indice unificado de OSs (Portal interno + sync Omie) vem de _os.ts

export async function computarR1(parametros: ParametrosR1 = {}): Promise<OportunidadeR1[]> {
  const revisoesAlvo = parametros.revisoes_alvo ?? [50, 300, 600];
  const diasAnteced = parametros.dias_anteced ?? 15;
  const diasPrimeiraRev = parametros.dias_primeira_revisao ?? 50;
  const hoje = new Date();
  const limiteFuturo = new Date(hoje.getTime() + diasAnteced * 86400000);

  const tratores = await lerTudo<Trator>((from, to) =>
    supabase.from("tratores").select("*").range(from, to)
  );

  const mapClienteOmie = await carregarMapaClientes();
  // Indice unificado: Ordem_Servico (Portal) + ordens_servico_relatorio (Omie)
  const chassisDosCandidatos = tratores.map((t) => t.Chassis || "").filter(Boolean);
  const indiceOS = await carregarIndiceOSCompleto(chassisDosCandidatos);

  const out: OportunidadeR1[] = [];
  for (const t of tratores) {
    if (!t.Entrega || !t.Cliente) continue;

    let prev;
    try { prev = calcularPrevisao(t); } catch { continue; }

    if (!revisoesAlvo.includes(prev.proximaRevHoras)) continue;

    // 1ª revisão (garantia): trator novo sem nenhuma revisão feita. A estimativa
    // por horímetro (0,5h/dia default) joga a previsão pra ~100 dias, tarde demais.
    // Regra de negócio: ~50 dias após a entrega já é hora da 1ª revisão. Então,
    // para o primeiro caso, usamos a data por TEMPO (entrega + dias_primeira_revisao)
    // quando ela for mais cedo que a estimativa por horímetro.
    const primeiraPendente = prev.ultimaRevHoras === 0 && prev.proximaRevHoras === 50;
    let dataEfetiva = prev.dataEstimada;
    let basePrimeiraTempo = false;
    if (primeiraPendente && t.Entrega) {
      const dataTempo = new Date(t.Entrega);
      dataTempo.setDate(dataTempo.getDate() + diasPrimeiraRev);
      if (dataTempo < dataEfetiva) { dataEfetiva = dataTempo; basePrimeiraTempo = true; }
    }
    const atrasadaEf = dataEfetiva < hoje && prev.proximaRevHoras !== 3000;
    const dentroDaJanela = dataEfetiva <= limiteFuturo;
    if (!atrasadaEf && !dentroDaJanela) continue;

    // Verificar se existe OS de revisão em Ordem_Servico depois da última
    // revisão registrada no trator. Se sim, considera que a revisão foi feita
    // (mesmo que tratores.{rev} Data não tenha sido preenchido).
    const ultimaRevDataReal = extrairUltimaRevData(t).toISOString();

    const chassi = (t.Chassis || "").trim().toUpperCase();
    const cliNorm = norm(t.Cliente);
    const osPorChassi = chassi ? indiceOS.porChassi.get(chassi) : undefined;
    const osPorCliente = indiceOS.porCliente.get(cliNorm);
    // Match por chassi é mais confiável; cliente é fallback (best-effort)
    const ultimaOS = osPorChassi || osPorCliente;

    if (ultimaOS && ultimaOS.data.toISOString() > ultimaRevDataReal) {
      // Já houve OS depois da última revisão registrada — pular
      continue;
    }

    const codigoOmie = mapClienteOmie.get(cliNorm) ?? null;
    // Politica: descarta cliente que nao bate com Clientes do Omie.
    // Cadastros em tratores estao inconsistentes (chassi errado, nome divergente).
    if (!codigoOmie) continue;

    out.push({
      regra: "R1_revisao",
      codigo_omie: codigoOmie,
      cliente_nome: t.Cliente,
      trator: `${t.Modelo || ""} — ${t.Chassis || ""}`.trim(),
      chassis: t.Chassis || null,
      prioridade: atrasadaEf ? "Urgente" : "Normal",
      detalhes: {
        revisao_alvo: `${prev.proximaRevHoras}h`,
        data_estimada: dataEfetiva.toISOString(),
        ultima_revisao_horas: prev.ultimaRevHoras,
        media_horas_dia: prev.mediaHorasDia,
        modelo: t.Modelo,
        cidade: t.Cidade,
        vendedor: t.Vendedor,
        atrasada: atrasadaEf,
        base_estimativa: basePrimeiraTempo ? "tempo_primeira" : "horimetro",
        entrega_data: t.Entrega || null,
        ultima_os_id: ultimaOS?.id_ordem ?? null,
        ultima_os_data: ultimaOS?.data.toISOString() ?? null,
        ultima_os_tipo: ultimaOS?.tipo_servico ?? null,
        ultima_os_fonte: ultimaOS?.fonte ?? null,
        ultima_os_empresa: ultimaOS?.empresa ?? null,
      },
    });
  }
  return out;
}

async function carregarMapaClientes(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const clientes = await lerTudo<{
    id_omie: string;
    nome_fantasia: string | null;
    razao_social: string | null;
  }>((from, to) =>
    supabase
      .from("portal_nt_clientes_PRINCIPAL")
      .select("id_omie, nome_fantasia, razao_social")
      .range(from, to)
  );
  for (const c of clientes) {
    if (c.nome_fantasia) m.set(c.nome_fantasia.trim().toUpperCase(), c.id_omie);
    if (c.razao_social)  m.set(c.razao_social.trim().toUpperCase(),  c.id_omie);
  }
  return m;
}
