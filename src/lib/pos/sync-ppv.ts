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
  // OS concluída NÃO conclui o pedido de peças: ele só fica "Concluída" quando a NF-e dele sai
  // (faturamento). Antes, PPV criado depois do serviço virava Concluída sem ser faturado
  // e as peças podiam nunca ser cobradas (PPV-0478, PPV-0513).
  if (novoStatusPPV === "Concluída") return;

  // Busca os PPVs vinculados à OS
  const { data: os } = await supabase
    .from(TBL_OS)
    .select("ID_PPV")
    .eq("Id_Ordem", idOrdem)
    .limit(1);

  const ppvIds = String(os?.[0]?.ID_PPV || "").split(",").map((s) => s.trim()).filter(Boolean);

  // Vinculados pela lista ID_PPV da OS OU pelo Id_Os do pedido (os dois lados do vínculo)
  const filtroOr = `Id_Os.eq.${idOrdem}${ppvIds.length ? `,id_pedido.in.(${ppvIds.map((x) => `"${x}"`).join(",")})` : ""}`;
  const { data: ppvs } = await supabase
    .from(TBL_PEDIDOS)
    .select("id_pedido, status, faturado_omie_em, status_manual_override")
    .or(filtroOr);

  // Filtra os que podem ser atualizados — mesmas regras do sync do quadro do PPV (queries.ts
  // sincronizarStatusComOS): não mexe em Concluída/Cancelada, em PPV já enviado ao Omie ou
  // faturado (senão um robô mexendo na OS puxava de volta um pedido que já está no Omie) nem em
  // PPV cuja fase alguém mudou na mão
  const aAtualizar = (ppvs || []).filter(
    (p) => p.status && !p.faturado_omie_em && !p.status_manual_override && p.status !== "Enviado Omie" && p.status !== "Concluída" && p.status !== "Cancelada" && p.status !== "Fechado" && p.status !== "Cancelado" && p.status !== novoStatusPPV
  );

  if (aAtualizar.length === 0) return;

  const idsAtualizar = aAtualizar.map((p) => p.id_pedido);

  // Update em batch
  await supabase
    .from(TBL_PEDIDOS)
    .update({ status: novoStatusPPV })
    .in("id_pedido", idsAtualizar);

  // Reserva confirmada via OS (checkbox) → alerta de estoque no limite
  if (novoStatusPPV === "Orçamento Aprovado") {
    import("@/lib/ppv/estoque-reserva")
      .then(({ avisarEstoqueNoLimite }) => Promise.allSettled(idsAtualizar.map((id) => avisarEstoqueNoLimite(String(id)))))
      .catch(() => { /* best-effort */ });
  }

  // Insert logs em batch
  const agora = new Date().toISOString();
  await supabase.from(TBL_LOGS_PPV).insert(
    idsAtualizar.map((ppvId) => ({
      id_ppv: ppvId,
      data_hora: agora,
      acao: `Status alterado para "${novoStatusPPV}" (sync com ${idOrdem})`,
      usuario_email: "Sistema",
    }))
  );
}
