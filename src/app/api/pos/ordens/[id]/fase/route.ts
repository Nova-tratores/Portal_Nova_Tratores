import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO } from "@/lib/pos/constants";
import { safeGet } from "@/lib/pos/utils";
import { sincronizarStatusPPV } from "@/lib/pos/sync-ppv";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOs } = await params;
  const { status: newStatus } = await req.json();

  // Busca status atual para log
  const { data: resAtual } = await supabase.from(TBL_OS).select("Status").eq("Id_Ordem", idOs).limit(1);
  const statusAnterior = resAtual && resAtual.length > 0 ? (safeGet(resAtual[0], "Status") as string) : "";

  if (statusAnterior === newStatus) {
    return NextResponse.json({ success: true, changed: false });
  }

  // Bloqueia mudança para Concluída se não foi enviada para Omie
  if (newStatus === "Concluída") {
    const { data: osData } = await supabase.from(TBL_OS).select("Ordem_Omie").eq("Id_Ordem", idOs).limit(1);
    if (!osData?.[0]?.Ordem_Omie) {
      return NextResponse.json({ success: false, erro: "A OS precisa ser enviada para o Omie antes de ser concluída." }, { status: 400 });
    }
  }

  await supabase.from(TBL_OS).update({ Status: newStatus }).eq("Id_Ordem", idOs);

  // Registrar log
  const agora = new Date();
  const dataFmt = new Intl.DateTimeFormat("pt-BR").format(agora);
  const horaFmt = agora.toLocaleTimeString("pt-BR");
  await supabase.from(TBL_LOGS_PPO).insert({
    Id_ppo: idOs, Data_Acao: dataFmt, Hora_Acao: horaFmt,
    UsuEmail: "admin.sistema@novatratores.com",
    acao: `Mudança rápida para ${newStatus}`,
    Status_Anterior: statusAnterior, Status_Atual: newStatus,
    Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
  });

  // Sincroniza status do PPV vinculado
  await sincronizarStatusPPV(idOs, newStatus);

  return NextResponse.json({ success: true, changed: true });
}
