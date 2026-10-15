// Cards do financeiro (Chamado_NF) ligados a documentos do Omie.
// "Excluir" um card no kanban só grava status = "excluido": a linha continua lá,
// com o nº da OS e do pedido de venda. O índice único (pedido + empresa) e as
// travas de "já existe card" enxergam essa linha — por isso o card novo da OS
// substituta não nascia. Aqui ficam as duas pontas disso.
import type { SupabaseClient } from "@supabase/supabase-js";

export const STATUS_EXCLUIDO = "excluido";

/** Nota acrescentada ao `obs` do card quando o portal mexe nele. */
function anotar(obs: unknown, texto: string): string {
  const dia = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `${String(obs || "").trim()}${obs ? "\n" : ""}[${dia}] ${texto}`;
}

/**
 * Tira o pedido de venda dos cards EXCLUÍDOS (para o card novo poder usar o mesmo pedido).
 * O nº antigo fica guardado no `obs`. Devolve quantos cards foram liberados.
 */
export async function liberarPedidoDeCardsExcluidos(sb: SupabaseClient, numPedido: string, empresa: string): Promise<number> {
  if (!numPedido) return 0;
  const { data } = await sb.from("Chamado_NF").select("id, obs")
    .eq("omie_num_pedido", numPedido).eq("omie_empresa", empresa).eq("status", STATUS_EXCLUIDO);
  let n = 0;
  for (const c of data || []) {
    const { error } = await sb.from("Chamado_NF").update({
      omie_num_pedido: null,
      obs: anotar(c.obs, `Pedido de venda ${numPedido} liberado deste card excluído para o card novo.`),
    }).eq("id", c.id);
    if (!error) n++;
  }
  return n;
}

/**
 * Nota cancelada para refazer: o card do documento antigo sai do financeiro
 * (status "excluido", como o botão do kanban) e solta o pedido de venda,
 * para o card da OS/pedido novo nascer sem trava.
 */
export async function retirarCardDoDocumentoCancelado(
  sb: SupabaseClient,
  doc: { numOS?: string | null; numPedido?: string | null; empresa: string },
  motivo: string,
): Promise<number[]> {
  const ors: string[] = [];
  if (doc.numOS) ors.push(`omie_num_os.eq.${doc.numOS}`);
  if (doc.numPedido) ors.push(`omie_num_pedido.eq.${doc.numPedido}`);
  if (!ors.length) return [];
  const { data } = await sb.from("Chamado_NF").select("id, obs, status, omie_num_os, omie_num_pedido")
    .eq("omie_empresa", doc.empresa).or(ors.join(","));
  const ids: number[] = [];
  for (const c of data || []) {
    if (c.status === STATUS_EXCLUIDO && !c.omie_num_pedido) continue;
    // só a NF-e de peças foi refeita e o card é de uma OS (serviço + peças): o serviço
    // continua valendo — não exclui, só deixa o aviso no card
    if (!doc.numOS && c.omie_num_os) {
      await sb.from("Chamado_NF").update({ obs: anotar(c.obs, `ATENÇÃO: ${motivo}. Confira a NF de peças deste card.`) }).eq("id", c.id);
      continue;
    }
    const { error } = await sb.from("Chamado_NF").update({
      status: STATUS_EXCLUIDO,
      omie_num_pedido: null,
      obs: anotar(c.obs, `Excluído pelo portal: ${motivo}${c.omie_num_pedido ? ` (pedido de venda ${c.omie_num_pedido} liberado)` : ""}.`),
    }).eq("id", c.id);
    if (!error) ids.push(Number(c.id));
  }
  return ids;
}
