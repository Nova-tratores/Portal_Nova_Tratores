import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO } from "@/lib/pos/constants";
import { criarOSNoOmie } from "@/lib/pos/omie";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOs } = await params;

  const result = await criarOSNoOmie(idOs);

  if (result.sucesso) {
    const agora = new Date();
    const dataFmt = new Intl.DateTimeFormat("pt-BR").format(agora);
    const horaFmt = agora.toLocaleTimeString("pt-BR");
    const acaoParts = [`OS enviada para Omie (nº ${result.cNumOS})`];
    if (result.pedidoVenda) acaoParts.push(`PV nº ${result.pedidoVenda}`);
    if (result.pedidoVendaErro) acaoParts.push(`Erro PV: ${result.pedidoVendaErro}`);

    // Move para Concluída automaticamente
    await supabase.from(TBL_OS).update({ Status: "Concluída" }).eq("Id_Ordem", idOs);

    await supabase.from(TBL_LOGS_PPO).insert({
      Id_ppo: idOs, Data_Acao: dataFmt, Hora_Acao: horaFmt,
      UsuEmail: "admin.sistema@novatratores.com",
      acao: acaoParts.join(" | "),
      Status_Anterior: "Enviado", Status_Atual: "Concluída",
      Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
    });
  }

  return NextResponse.json(result);
}
