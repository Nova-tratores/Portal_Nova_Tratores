// R4 — Follow-up de feedback.
//
// Cliente cuja última interação (data_contato, ultimo_servico ou data_servico)
// completou exatamente `dias_aniversario` (default 30, com janela de 7 dias)
// vira lembrete de retorno para coletar feedback / verificar satisfação.

import { supabaseAdmin as supabase } from "@/lib/server/supabase-admin";
import type { FeedbackRegistro } from "@/lib/feedbacks/types";
import { lerTudo } from "./_paginar";

interface ParametrosR4 {
  dias_aniversario?: number;  // default 30
  janela_dias?: number;        // default 7  (janela [aniv, aniv+janela])
}

interface OportunidadeR4 {
  regra: "R4_followup";
  codigo_omie: string | null;
  cliente_nome: string;
  trator: string | null;
  chassis: string | null;
  detalhes: Record<string, unknown>;
  prioridade: "Normal";
}

function norm(s: string | null | undefined): string {
  return (s || "").trim().toUpperCase();
}

export async function computarR4(parametros: ParametrosR4 = {}): Promise<OportunidadeR4[]> {
  const diasAniv = parametros.dias_aniversario ?? 30;
  const janela = parametros.janela_dias ?? 7;
  const hojeMs = Date.now();

  const registros = await lerTudo<Pick<FeedbackRegistro,
    "id" | "tipo" | "nome" | "telefone" | "trator" | "tecnico" | "codigo_omie" |
    "data_contato" | "ultimo_servico" | "data_servico">>((from, to) =>
    supabase
      .from("feedback_registros")
      .select("id, tipo, nome, telefone, trator, tecnico, codigo_omie, data_contato, ultimo_servico, data_servico")
      .range(from, to)
  );

  // Agrupar por cliente (nome normalizado), pegar a última data de referência
  interface UltimoContato {
    ultimaData: string;
    registro: typeof registros[number];
  }
  const porCliente = new Map<string, UltimoContato>();

  for (const r of registros) {
    const dataRef = r.data_contato || r.ultimo_servico || r.data_servico;
    if (!dataRef) continue;
    const key = norm(r.nome);
    if (!key) continue;
    const atual = porCliente.get(key);
    if (!atual || dataRef > atual.ultimaData) {
      porCliente.set(key, { ultimaData: dataRef, registro: r });
    }
  }

  const out: OportunidadeR4[] = [];
  for (const { ultimaData, registro } of porCliente.values()) {
    const dias = Math.floor((hojeMs - new Date(ultimaData).getTime()) / 86400000);
    if (dias < diasAniv) continue;
    if (dias >= diasAniv + janela) continue;

    out.push({
      regra: "R4_followup",
      codigo_omie: registro.codigo_omie,
      cliente_nome: registro.nome,
      trator: registro.trator,
      chassis: null,
      prioridade: "Normal",
      detalhes: {
        ultimo_contato: ultimaData,
        dias_desde_ultimo: dias,
        tecnico: registro.tecnico,
        telefone: registro.telefone,
        tipo_registro: registro.tipo,
        feedback_id_origem: registro.id,
      },
    });
  }
  return out;
}
