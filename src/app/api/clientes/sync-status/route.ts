// Timer da Pasta Clientes (José, 15/10/2026): quando a pasta conferiu o Omie pela
// última vez e quando confere de novo. É a mesma rodada (clientes-sync-recente, do
// agendador) que baixa as notas e cria os cards do financeiro das OS faturadas.
import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import { proximaExecucao, descreverQuando, type Agendamento } from "@/lib/agendador/regras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB = "clientes-sync-recente";

export async function GET(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: "clientes" }]);
  if (acesso.resposta) return acesso.resposta;
  const agora = new Date();
  const [{ data: ags }, { data: runs }] = await Promise.all([
    sb.from("agendamentos").select("*").eq("chave", JOB).limit(1),
    sb.from("cron_runs").select("iniciado_em, finalizado_em, status").eq("job", JOB).order("iniciado_em", { ascending: false }).limit(6),
  ]);
  const ag = (ags?.[0] || null) as Agendamento | null;
  const lista = runs || [];
  const rodando = lista.find((r) => r.status === "rodando" && Date.now() - new Date(r.iniciado_em).getTime() < 15 * 60_000) || null;
  const ultima = lista.find((r) => r.status !== "rodando" && r.status !== "interrompida") || null;
  const ultimaInicio = lista.find((r) => r.status !== "interrompida")?.iniciado_em || null;
  const proxima = ag ? proximaExecucao(ag, ultimaInicio ? new Date(ultimaInicio) : null, agora) : null;
  return NextResponse.json({
    ativo: !!ag?.ativo,
    quando: ag ? descreverQuando(ag) : "a cada 5 min",
    intervaloMin: ag?.intervalo_min || 5,
    rodandoDesde: rodando?.iniciado_em || null,
    ultima: ultima ? { em: ultima.finalizado_em || ultima.iniciado_em, status: ultima.status } : null,
    proxima: proxima?.toISOString() || null,
    agora: agora.toISOString(),
  });
}
