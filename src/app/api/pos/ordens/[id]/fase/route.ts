import { NextRequest, NextResponse } from "next/server";
import { aplicarMudancaFase } from "@/lib/pos/fase";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO } from "@/lib/pos/constants";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOs } = await params;
  const { status: newStatus, userName, previsaoExecucao } = await req.json();

  // OS faturada não muda de fase (a coluna só existe com sql/pos-faturamento.sql)
  const { data: fat, error: errFat } = await supabase.from(TBL_OS).select("faturado_omie_em, Status").eq("Id_Ordem", idOs).limit(1);
  if (!errFat && fat?.[0]?.faturado_omie_em && fat[0].Status !== newStatus && newStatus !== "Concluída") {
    return NextResponse.json({ success: false, erro: "Esta OS já foi faturada: só pode ir para Concluída." }, { status: 409 });
  }

  const r = await aplicarMudancaFase(idOs, newStatus, userName || "Sistema", { notificar: true });

  if (!r.success) {
    return NextResponse.json({ success: false, erro: r.erro }, { status: 400 });
  }

  // Agendamento junto com a fase (checkbox "reservado/agendado"): grava a
  // Data Início do Serviço escolhida e deixa registrado na timeline.
  if (typeof previsaoExecucao === "string" && /^\d{4}-\d{2}-\d{2}$/.test(previsaoExecucao)) {
    await supabase.from(TBL_OS).update({ Previsao_Execucao: previsaoExecucao }).eq("Id_Ordem", idOs);
    const agora = new Date();
    await supabase.from(TBL_LOGS_PPO).insert({
      Id_ppo: idOs,
      Data_Acao: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(agora),
      Hora_Acao: agora.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      UsuEmail: userName || "Sistema",
      acao: `Serviço agendado para ${previsaoExecucao.split("-").reverse().join("/")} (data início atualizada)`,
      Status_Anterior: newStatus, Status_Atual: newStatus,
      Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
    });
  }

  // Pedido aprovado com data + peças vinculadas → e-mail pro Zezo/Danilo
  // (e a separação sai junto se já passou da hora do lembrete da véspera)
  if (newStatus === "Orçamento Aprovado") {
    import("@/lib/pos/emails-pecas")
      .then(({ processarAprovacao }) => processarAprovacao(idOs, typeof previsaoExecucao === "string" ? previsaoExecucao : undefined))
      .catch(() => { /* best-effort */ });
  }

  return NextResponse.json({ success: true, changed: r.changed });
}
