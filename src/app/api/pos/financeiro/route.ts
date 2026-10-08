import { NextRequest, NextResponse } from "next/server";
import { valorPecasDosPPVs } from "@/lib/pos/pecas-ppv";
import { buscarPPVPorId } from "@/lib/ppv/queries";

export async function GET(req: NextRequest) {
  const ppv = req.nextUrl.searchParams.get("ppv") || "";
  const listaIds = ppv.split(",").map((s) => s.trim()).filter(Boolean);
  if (!listaIds.length) return NextResponse.json([]);

  // Mesma conta do drawer do PPV (saídas − devoluções, preço e conta do item),
  // por PPV — a OS precisa saber de qual PPV é cada peça pra editar/devolver.
  const detalhes = await Promise.all(listaIds.map((id) => buscarPPVPorId(id).catch(() => null)));
  const produtos = detalhes.flatMap((d, i) => {
    if (!d) return [];
    return d.produtos.map((p) => {
      const qtdDev = d.devolucoes.filter((x) => x.codigo === p.codigo).reduce((a, x) => a + x.quantidade, 0);
      return {
        ppvId: listaIds[i],
        pedidoOmie: d.pedidoOmie || "",
        codigo: p.codigo,
        descricao: p.descricao,
        qtde: p.quantidade - qtdDev,
        valor: p.preco,
        conta: /primari|castro/i.test(p.empresa || "") ? "CASTRO" : "NOVA",
      };
    }).filter((p) => p.qtde > 0);
  });

  // desconto percentual do(s) PPV(s) em R$ — o drawer abate do total de peças
  // (senão o total mostrado divergia do Valor_Total salvo, que já desconta)
  const pv = await valorPecasDosPPVs(listaIds);
  return NextResponse.json({ produtos, desconto_ppv: pv.desconto });
}
