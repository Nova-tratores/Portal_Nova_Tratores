import { NextRequest, NextResponse } from "next/server";
import { supabaseFetch, getValorInsensivel } from "@/lib/ppv/supabase";
import { TBL_PEDIDOS, TBL_ITENS, TBL_OS } from "@/lib/ppv/constants";

// Preview do card do PPV no hover:
//  - com OS vinculada  → descrição da OS (Solicitação do cliente) + produtos
//  - sem OS            → produtos + observação
// Uma chamada só; o card cacheia no cliente.

function extrairSolicitacao(texto: string): string {
  if (!texto) return "";
  const marc = "Solicitação do cliente:";
  const i = texto.indexOf(marc);
  if (i === -1) return texto.trim();
  const depois = texto.slice(i + marc.length);
  const fim = depois.indexOf("Serviço Realizado:");
  return (fim !== -1 ? depois.slice(0, fim) : depois).trim();
}

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  try {
    const ped = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_PEDIDOS}?id_pedido=eq.${encodeURIComponent(id)}&select=observacao,Id_Os&limit=1`
    );
    const row = ped?.[0] || {};
    const osId = String(getValorInsensivel(row, "Id_Os", "osId") || "").trim();
    const observacao = String(getValorInsensivel(row, "observacao") || "").trim();

    // Produtos — soma a quantidade líquida por código (Saída − Devolução)
    const itens = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_ITENS}?Id_PPV=eq.${encodeURIComponent(id)}&select=CodProduto,Descricao,Qtde,TipoMovimento`
    );
    const mapa: Record<string, { descricao: string; qtde: number }> = {};
    for (const it of itens || []) {
      const cod = String(getValorInsensivel(it, "CodProduto") || "").trim();
      if (!cod) continue;
      const desc = String(getValorInsensivel(it, "Descricao") || cod);
      const q = parseFloat(String(getValorInsensivel(it, "Qtde") || 0)) || 0;
      const tipo = String(getValorInsensivel(it, "TipoMovimento") || "");
      if (!mapa[cod]) mapa[cod] = { descricao: desc, qtde: 0 };
      mapa[cod].qtde += /devolu/i.test(tipo) ? -q : q;
    }
    const produtos = Object.values(mapa).filter((p) => p.qtde > 0);

    let osDescricao = "";
    if (osId) {
      const os = await supabaseFetch<Record<string, unknown>[]>(
        `${TBL_OS}?Id_Ordem=eq.${encodeURIComponent(osId)}&select=Serv_Solicitado&limit=1`
      );
      osDescricao = extrairSolicitacao(String(getValorInsensivel(os?.[0] || {}, "Serv_Solicitado") || ""));
    }

    return NextResponse.json({ temOS: !!osId, osId, osDescricao, observacao, produtos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
