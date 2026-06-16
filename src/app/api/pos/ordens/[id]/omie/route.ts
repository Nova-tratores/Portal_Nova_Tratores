import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO } from "@/lib/pos/constants";
import { criarOSNoOmie } from "@/lib/pos/omie";
import { registrarAlimentacaoOS } from "@/lib/pos/alimentacao-os";
import { logAndNotify } from "@/lib/server/audit-notify";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOs } = await params;
  let userName = "Sistema";
  try { const body = await req.json(); userName = body.userName || "Sistema"; } catch {}

  const result = await criarOSNoOmie(idOs);

  if (result.sucesso) {
    const agora = new Date();
    const dataFmt = new Intl.DateTimeFormat("pt-BR").format(agora);
    const horaFmt = agora.toLocaleTimeString("pt-BR");
    const acaoParts = [
      result.interna
        ? `Ordem interna concluída${result.cNumOS ? ` (remessa de peças nº ${result.cNumOS})` : " (sem peças)"}`
        : `OS enviada para Omie (nº ${result.cNumOS})`,
    ];
    if (result.pedidoVenda) acaoParts.push(`PV nº ${result.pedidoVenda}`);
    if (result.pedidoVendaErro) acaoParts.push(`Erro remessa: ${result.pedidoVendaErro}`);

    // Move para Concluída automaticamente
    await supabase.from(TBL_OS).update({ Status: "Concluída" }).eq("Id_Ordem", idOs);

    // Registra despesa de alimentação automaticamente como Requisicao (fluxo padrão)
    try {
      const alim = await registrarAlimentacaoOS(idOs);
      if (alim.criada) {
        console.log(`[alimentacao-os] OS ${idOs} → Requisicao #${alim.requisicaoId} criada (financeiro)`);
      } else if (alim.motivoPulado) {
        console.log(`[alimentacao-os] OS ${idOs} pulado: ${alim.motivoPulado}`);
      }
    } catch (e) {
      console.error(`[alimentacao-os] OS ${idOs} falhou (ignorado):`, e instanceof Error ? e.message : e);
    }

    await supabase.from(TBL_LOGS_PPO).insert({
      Id_ppo: idOs, Data_Acao: dataFmt, Hora_Acao: horaFmt,
      UsuEmail: userName,
      acao: acaoParts.join(" | "),
      Status_Anterior: "Enviado", Status_Atual: "Concluída",
      Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
    });

    await logAndNotify({
      userName, sistema: "pos", acao: result.interna ? "concluir_interna" : "enviar_omie",
      entidade: "ordem_servico", entidadeId: idOs, entidadeLabel: `OS ${idOs}`,
      detalhes: { cNumOS: result.cNumOS, pedidoVenda: result.pedidoVenda, interna: result.interna },
      notifTitulo: result.interna ? `Ordem interna ${idOs} concluída` : `OS ${idOs} enviada para Omie`,
      notifDescricao: result.interna
        ? `${userName} concluiu a ordem interna ${idOs}${result.cNumOS ? ` (remessa de peças nº ${result.cNumOS})` : ""}`
        : `${userName} enviou OS ${idOs} para Omie (nº ${result.cNumOS})`,
      notifLink: `/pos?id=${idOs}`,
    });
  }

  return NextResponse.json(result);
}
