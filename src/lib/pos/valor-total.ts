// Valor_Total da OS recalculado pelo que está no banco (José, 23/10/2026: "na capa do card os valores não são
// atualizados"). Antes só o salvar da OS recalculava: mudou o PPV (peças, desconto) ou uma requisição e a capa
// ficava com o valor velho. Mesma conta do PATCH /api/pos/ordens/[id]: horas + km + peças dos PPVs (com o
// desconto de cada PPV) + requisições + serviços incluídos − descontos. Só grava quando muda.
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_REQ_ATT } from "@/lib/pos/constants";
import { getConfigPOS } from "@/lib/pos/config";
import { valorPecasDosPPVs } from "@/lib/pos/pecas-ppv";
import { parseValorMisto } from "@/lib/marketing/custos";
import { totalExtras, type OmieEspelho } from "@/lib/pos/omie-espelho";

const num = (v: unknown) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };

export async function recalcularValorTotalOS(idOs: string): Promise<number | null> {
  const id = String(idOs || "").trim();
  if (!id) return null;
  const { data } = await supabase.from(TBL_OS)
    .select("Id_Ordem, Qtd_HR, Valor_HR, Qtd_KM, Valor_KM, Desconto, Desconto_Hora, Desconto_KM, Omie_Espelho, ID_PPV, Id_Req, Valor_Total, Status, faturado_omie_em")
    .eq("Id_Ordem", id).limit(1);
  const os = data?.[0] as Record<string, unknown> | undefined;
  // OS faturada ou cancelada: o valor é o que foi para a nota — não mexe
  if (!os || os.faturado_omie_em || /cancel/i.test(String(os.Status || ""))) return null;

  const ids = String(os.ID_PPV || "").split(",").map((s) => s.trim()).filter(Boolean);
  const vPecas = (await valorPecasDosPPVs(ids)).total;

  let vReq = 0;
  const { data: reqs } = await supabase.from("Requisicao").select("valor_cobrado_cliente")
    .eq("ordem_servico", id).not("status", "in", '("lixeira","cancelada")');
  for (const r of reqs || []) vReq += parseValorMisto((r as { valor_cobrado_cliente: unknown }).valor_cobrado_cliente);
  for (const rid of String(os.Id_Req || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const { data: att } = await supabase.from(TBL_REQ_ATT).select("ReqValor").eq("ReqREF", rid).limit(1);
    if (att?.length) vReq += parseValorMisto((att[0] as { ReqValor: unknown }).ReqValor);
  }

  const cfg = await getConfigPOS();
  const unitHr = num(os.Valor_HR) > 0 ? num(os.Valor_HR) : cfg.valor_hora;
  const unitKm = num(os.Valor_KM) > 0 ? num(os.Valor_KM) : cfg.valor_km;
  const vExtras = os.Omie_Espelho && typeof os.Omie_Espelho === "object" ? totalExtras(os.Omie_Espelho as OmieEspelho) : 0;
  const total = Math.round((num(os.Qtd_HR) * unitHr + num(os.Qtd_KM) * unitKm + vPecas + vReq + vExtras
    - num(os.Desconto) - num(os.Desconto_Hora) - num(os.Desconto_KM)) * 100) / 100;

  if (Math.abs(total - num(os.Valor_Total)) >= 0.005) {
    const { error } = await supabase.from(TBL_OS).update({ Valor_Total: total }).eq("Id_Ordem", id);
    if (error) console.warn(`[valor-total] ${id}: ${error.message}`);
  }
  return total;
}

/** OS ligadas a um PPV (Id_Os do pedido ou lista ID_PPV da OS) — recalcula todas. Nunca lança. */
export async function recalcularOSDoPPV(idPPV: string): Promise<void> {
  try {
    const pid = String(idPPV || "").trim();
    if (!pid) return;
    const [{ data: ped }, { data: oss }] = await Promise.all([
      supabase.from("pedidos").select("Id_Os").eq("id_pedido", pid).limit(1),
      supabase.from(TBL_OS).select("Id_Ordem").ilike("ID_PPV", `%${pid}%`),
    ]);
    const alvo = new Set<string>();
    const idOs = String((ped?.[0] as { Id_Os?: string } | undefined)?.Id_Os || "").trim();
    if (idOs) alvo.add(idOs);
    for (const o of (oss || []) as { Id_Ordem: string }[]) alvo.add(o.Id_Ordem);
    for (const o of alvo) await recalcularValorTotalOS(o);
  } catch (e) { console.warn(`[valor-total] PPV ${idPPV}: ${e instanceof Error ? e.message : e}`); }
}
