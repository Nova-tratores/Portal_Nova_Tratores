// GET /api/ppv/pedidos/pdf-omie?id=PV-XXXX — link do PDF OFICIAL do pedido
// de venda no Omie (depois do "Enviar Omie"):
//   1. lê pedido_omie + omie_empresa do PPV
//   2. ConsultarPedido (codigo_pedido_integracao "PV-{id}"; fallback numero_pedido)
//   3. /produtos/dfedocs/ · ObterPedVenda { nIdPed } → cPdfPed
import { NextRequest, NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/ppv/supabase";
import { TBL_PEDIDOS } from "@/lib/ppv/constants";
import { contaOmie } from "@/lib/omie/contas";

const OMIE_BASE = "https://app.omie.com.br/api/v1";

async function omieCall<T>(ep: string, call: string, param: Record<string, unknown>, key: string, secret: string): Promise<T> {
  const res = await fetch(`${OMIE_BASE}${ep}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: key, app_secret: secret, param: [param] }),
  });
  const data = await res.json().catch(() => ({}));
  if (data?.faultstring) throw new Error(data.faultstring);
  if (data?.status === "error") throw new Error(data.message || "Erro Omie");
  return data as T;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "?id=PV-XXXX" }, { status: 400 });

  const rows = await supabaseFetch<{ pedido_omie?: string; omie_empresa?: string }[]>(
    `${TBL_PEDIDOS}?id_pedido=eq.${encodeURIComponent(id)}&select=pedido_omie,omie_empresa&limit=1`
  );
  const ped = rows?.[0];
  if (!ped) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  if (!ped.pedido_omie) {
    return NextResponse.json({ error: "Este pedido ainda não foi enviado ao Omie." }, { status: 400 });
  }

  const acc = contaOmie(ped.omie_empresa);
  try {
    // Resolve o código interno do pedido no Omie
    type Consulta = { pedido_venda_produto?: { cabecalho?: { codigo_pedido?: number } } };
    let codPedido = 0;
    try {
      const c = await omieCall<Consulta>("/produtos/pedido/", "ConsultarPedido",
        { codigo_pedido_integracao: `PV-${id}` }, acc.key, acc.secret);
      codPedido = Number(c?.pedido_venda_produto?.cabecalho?.codigo_pedido || 0);
    } catch { /* tenta pelo número */ }
    if (!codPedido) {
      const c = await omieCall<Consulta>("/produtos/pedido/", "ConsultarPedido",
        { numero_pedido: String(ped.pedido_omie) }, acc.key, acc.secret);
      codPedido = Number(c?.pedido_venda_produto?.cabecalho?.codigo_pedido || 0);
    }
    if (!codPedido) return NextResponse.json({ error: "Pedido não localizado no Omie." }, { status: 404 });

    const doc = await omieCall<{ cPdfPed?: string; cDesStatus?: string }>(
      "/produtos/dfedocs/", "ObterPedVenda", { nIdPed: codPedido }, acc.key, acc.secret);
    const url = String(doc?.cPdfPed || "");
    if (!url) {
      return NextResponse.json({ error: doc?.cDesStatus || "Omie não devolveu o PDF do pedido." }, { status: 502 });
    }
    return NextResponse.json({ url, codPedido });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao consultar o Omie." }, { status: 502 });
  }
}
