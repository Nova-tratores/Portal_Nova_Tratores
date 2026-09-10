// Rótulos em linguagem de balcão para o cockpit (sem jargão de sistema).
import type { RegraOportunidade } from "@/lib/feedbacks/types";

export const REGRA_ROTULO: Record<RegraOportunidade, { titulo: string; emoji: string; cor: string; oQueFazer: string }> = {
  R1_revisao:         { titulo: "Revisão de garantia vencendo", emoji: "🔧", cor: "#dc2626", oQueFazer: "Agendar a revisão com o cliente." },
  R7_garantia_risco:  { titulo: "Garantia em risco",            emoji: "⏳", cor: "#e11d48", oQueFazer: "Avisar que o prazo do cheque está acabando e agendar." },
  R2_sem_os:          { titulo: "Sem serviço há tempo",         emoji: "🏗️", cor: "#f59e0b", oQueFazer: "Perguntar como está a máquina e oferecer revisão." },
  R6_fora_garantia:   { titulo: "Fora de garantia",             emoji: "🛡️", cor: "#0ea5e9", oQueFazer: "Oferecer plano de manutenção / revisão paga." },
  R5_pecas:           { titulo: "Reposição de peças",           emoji: "🔩", cor: "#8b5cf6", oQueFazer: "Oferecer peças de reposição ou kit de manutenção." },
  R3_upsell:          { titulo: "Pode comprar mais",            emoji: "📈", cor: "#10b981", oQueFazer: "Sondar necessidade de implemento ou máquina nova." },
  R4_followup:        { titulo: "Retorno de pós-venda",         emoji: "📞", cor: "#3b82f6", oQueFazer: "Perguntar se o serviço anterior ficou bom." },
};

export const STATUS_ATENDIMENTO_ROTULO: Record<string, string> = {
  aberto: "Em aberto",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  sem_resposta: "Não respondeu",
  arquivado: "Arquivado",
};

export function fmtDataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

export function fmtMoeda(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "há 3 dias", "há 2 meses", "hoje" — sempre a partir de YYYY-MM-DD, lido como data LOCAL. */
export function haQuanto(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((hoje.getTime() - d.getTime()) / 86400000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 0) return `em ${-dias} dia${-dias > 1 ? "s" : ""}`;
  if (dias < 60) return `há ${dias} dias`;
  const meses = Math.round(dias / 30);
  if (meses < 24) return `há ${meses} meses`;
  return `há ${Math.round(meses / 12)} anos`;
}
