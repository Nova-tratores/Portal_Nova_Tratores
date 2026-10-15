// "Nº do Pedido do Cliente" cruzado entre OS e pedidos/remessas (José, 15/10/2026):
// quando a OS (sempre na NOVA) e o pedido estão em EMPRESAS DIFERENTES, o número vai
// com o nome da empresa na frente — na OS da Nova "CASTRO 4133"; no pedido/remessa da
// Castro "NOVA 5377". Mesma empresa: só o número, como sempre.
import { supabase } from "@/lib/pos/supabase";

export const ehCastro = (empresa: unknown) => /castro|primari/i.test(String(empresa || ""));
const semZeros = (n: unknown) => String(n ?? "").trim().replace(/^0+(?=\d)/, "");

/** como o pedido aparece na OS (da Nova) */
export function refPedidoNaOS(numero: unknown, empresaPedido: unknown): string {
  const n = semZeros(numero);
  return n && ehCastro(empresaPedido) ? `CASTRO ${n}` : n;
}

/** como a OS (da Nova) aparece no pedido/remessa */
export function refOSNoPedido(numeroOS: unknown, empresaPedido: unknown): string {
  const n = semZeros(numeroOS);
  return n && ehCastro(empresaPedido) ? `NOVA ${n}` : n;
}

/** "Nº do Pedido do Cliente" da OS a partir dos PPVs dela (no Omie, não cancelados). Omie aceita 15 letras. */
export async function pedidoClienteDaOS(ppvIds: string[]): Promise<string> {
  const ids = ppvIds.map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return "";
  const { data } = await supabase.from("pedidos").select("id_pedido, pedido_omie, omie_empresa, status").in("id_pedido", ids);
  const porId = new Map((data || []).map((p) => [String(p.id_pedido), p as Record<string, unknown>]));
  return ids
    .map((id) => porId.get(id))
    .filter((p): p is Record<string, unknown> => !!p && !!p.pedido_omie && !/cancel/i.test(String(p.status || "")))
    .map((p) => refPedidoNaOS(p.pedido_omie, p.omie_empresa))
    .filter(Boolean)
    .join(", ")
    .slice(0, 15);
}
