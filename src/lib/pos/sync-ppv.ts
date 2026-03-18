import { supabase } from "./supabase";
import { TBL_OS, TBL_PEDIDOS, TBL_LOGS_PPV, POS_TO_PPV_STATUS } from "./constants";

/**
 * Sincroniza o status dos PPVs vinculados quando o status da OS muda.
 * POS Execução → PPV Em Andamento
 * POS Executada → PPV Aguardando Para Faturar
 */
export async function sincronizarStatusPPV(idOrdem: string, novoStatusPOS: string): Promise<void> {
  const novoStatusPPV = POS_TO_PPV_STATUS[novoStatusPOS];
  if (!novoStatusPPV) return;

  // Busca os PPVs vinculados à OS
  const { data: os } = await supabase
    .from(TBL_OS)
    .select("ID_PPV")
    .eq("Id_Ordem", idOrdem)
    .limit(1);

  const idPpvStr = os?.[0]?.ID_PPV;
  if (!idPpvStr) return;

  const ppvIds = String(idPpvStr).split(",").map((s) => s.trim()).filter(Boolean);
  if (ppvIds.length === 0) return;

  for (const ppvId of ppvIds) {
    // Verifica status atual do PPV (não move se já Fechado ou Cancelado)
    const { data: ppv } = await supabase
      .from(TBL_PEDIDOS)
      .select("status")
      .eq("id_pedido", ppvId)
      .limit(1);

    const statusAtual = ppv?.[0]?.status;
    if (!statusAtual || statusAtual === "Fechado" || statusAtual === "Cancelado") continue;
    if (statusAtual === novoStatusPPV) continue;

    // Atualiza status do PPV
    await supabase
      .from(TBL_PEDIDOS)
      .update({ status: novoStatusPPV })
      .eq("id_pedido", ppvId);

    // Registra log no PPV
    await supabase.from(TBL_LOGS_PPV).insert({
      id_ppv: ppvId,
      data_hora: new Date().toISOString(),
      acao: `Status alterado para "${novoStatusPPV}" (sync com ${idOrdem})`,
      usuario_email: "admin.sistema@novatratores.com",
    });
  }
}
