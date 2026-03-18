import { NextRequest, NextResponse } from "next/server";
import { supabaseFetch, getValorInsensivel } from "@/lib/ppv/supabase";
import { TBL_REVISOES, TBL_PRODUTOS } from "@/lib/ppv/constants";

async function buscarDetalhesProduto(codigo: string) {
  try {
    const res = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_PRODUTOS}?Codigo_Produto=eq.${encodeURIComponent(codigo)}&select=*`
    );
    if (res && res.length > 0) {
      return {
        descricao: String(getValorInsensivel(res[0], "Descricao_Produto", "descricao") || `Item ${codigo}`),
        preco: parseFloat(String(getValorInsensivel(res[0], "Preco_Venda", "preco") || 0)),
      };
    }
  } catch (e) {
    console.error("Erro detalhe produto:", e);
  }
  return { descricao: `Item ${codigo} (Não Cadastrado)`, preco: 0 };
}

export async function GET(req: NextRequest) {
  const trator = req.nextUrl.searchParams.get("trator");
  const horas = req.nextUrl.searchParams.get("horas");

  if (!trator || !horas)
    return NextResponse.json([]);

  try {
    const todas = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_REVISOES}?select=*`
    );
    if (!todas || todas.length === 0) return NextResponse.json([]);

    const buscaTrator = trator.toUpperCase().trim();
    const buscaHoras = horas.toUpperCase().trim();

    const kit = todas.find((row) => {
      const rowTrator = String(getValorInsensivel(row, "Trator", "Modelo") || "").toUpperCase().trim();
      const rowCodTrator = String(getValorInsensivel(row, "Cod_Trator") || "").toUpperCase().trim();
      const rowHoras = String(getValorInsensivel(row, "Horas", "Horimetro") || "").toUpperCase().trim();
      return (
        (rowTrator === buscaTrator || rowCodTrator === buscaTrator) &&
        rowHoras === buscaHoras
      );
    });

    if (!kit) return NextResponse.json([]);

    const listaMap: Record<string, { codigo: string; descricao: string; quantidade: number; preco: number }> = {};

    for (let i = 1; i <= 30; i++) {
      const codigo = getValorInsensivel(kit, `Cod_Prod_${i}`, `cod_prod_${i}`, `Produto_${i}`);
      const qtd = getValorInsensivel(kit, `Qtd${i}`, `qtd${i}`, `Qtd_${i}`, `qtd_${i}`);
      const codigoLimpo = String(codigo || "").trim();

      if (codigoLimpo && codigoLimpo.toUpperCase() !== "NULL" && codigoLimpo.length > 1) {
        const q = parseFloat(String(qtd || 1));
        if (listaMap[codigoLimpo]) {
          listaMap[codigoLimpo].quantidade += q;
        } else {
          const detalhes = await buscarDetalhesProduto(codigoLimpo);
          listaMap[codigoLimpo] = {
            codigo: codigoLimpo,
            descricao: detalhes.descricao,
            quantidade: q,
            preco: detalhes.preco,
          };
        }
      }
    }

    return NextResponse.json(Object.values(listaMap));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
