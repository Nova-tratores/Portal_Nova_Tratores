import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS } from "@/lib/pos/constants";
import { aplicarMudancaFase, ultimoDiaServico } from "@/lib/pos/fase";

// Transições automáticas de fase por data (rodar 1x/dia via cron):
//  A) Chegou a Previsão de Execução → "Execução" (só de fases iniciais)
//  B) Passou 1 dia do ÚLTIMO dia de serviço da OS (Dias_Execucao; sem dias,
//     a própria Previsão de Execução) → "Aguardando ordem Técnico"
const FASES_INICIAIS = [
  "Orçamento",
  "Orçamento enviado para o cliente e aguardando",
  "Orçamento Aprovado", // agendada pelo checkbox de reserva → vira Execução no dia marcado
  "Aguardando ordem Técnico",
];
const FASES_EXECUCAO = [
  "Execução",
  "Execução (Realizando Diagnóstico)",
  "Execução aguardando peças (em transporte)",
];
const FASE_EXECUCAO = "Execução";
const FASE_RELATORIO = "Aguardando ordem Técnico";

// Data de "hoje" no fuso de Brasília (YYYY-MM-DD)
function hojeBR(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().split("T")[0];
}
function maisUmDia(data: string): string {
  const d = new Date(data + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export async function POST(req: NextRequest) {
  // Guard opcional: se CRON_SECRET estiver definido, exige o segredo.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
    if (provided !== secret) return NextResponse.json({ ok: false, erro: "unauthorized" }, { status: 401 });
  }

  const hoje = hojeBR();

  const { data: ordens, error } = await supabase
    .from(TBL_OS)
    .select("Id_Ordem, Status, Previsao_Execucao, Dias_Execucao")
    .not("Status", "in", '("Concluída","Cancelada")');

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const movidas: Array<{ id: string; de: string; para: string }> = [];

  for (const os of ordens || []) {
    const status = String(os.Status || "").trim();
    const prevExec = String(os.Previsao_Execucao || "").trim();
    const ultimoDia = ultimoDiaServico(os.Previsao_Execucao, os.Dias_Execucao);
    const passouServico = !!ultimoDia && maisUmDia(ultimoDia) <= hoje;

    let destino: string | null = null;

    // B) 1 dia depois do último dia de serviço → relatório (a partir das fases de execução)
    if (passouServico && FASES_EXECUCAO.includes(status)) {
      destino = FASE_RELATORIO;
    }
    // A) Previsão de execução chegou → Execução (só fases iniciais e com serviço ainda em curso)
    else if (FASES_INICIAIS.includes(status) && prevExec && prevExec <= hoje && !passouServico) {
      destino = FASE_EXECUCAO;
    }

    if (!destino || destino === status) continue;

    const r = await aplicarMudancaFase(String(os.Id_Ordem), destino, "Automático (datas)", {
      notificar: false,
      acaoLog: `Fase automática por data: ${status} → ${destino}`,
    });
    if (r.changed) movidas.push({ id: String(os.Id_Ordem), de: status, para: destino });
  }

  return NextResponse.json({ ok: true, movidas: movidas.length, detalhe: movidas });
}
