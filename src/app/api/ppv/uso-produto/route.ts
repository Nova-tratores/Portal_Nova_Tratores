// Onde um produto foi/está sendo usado: dado um código, lista os PPVs que têm
// esse produto (movimentacoes.CodProduto), juntando os dados do pedido
// (cliente, status, data). Usado pelo filtro por código dentro do PPV.
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

export const dynamic = "force-dynamic";

// O código do catálogo vem sem "RP-"; no Omie está com. Testamos as duas formas.
const variantes = (c: string) => {
  const base = c.trim();
  const semRp = base.replace(/^RP-/i, "");
  return [...new Set([base, semRp, `RP-${semRp}`])];
};

export async function GET(req: NextRequest) {
  const codigo = (req.nextUrl.searchParams.get("codigo") || "").trim();
  if (!codigo) return NextResponse.json({ error: "informe o código" }, { status: 400 });

  // Movimentações desse produto (só Saída — é o que "consome" o produto).
  const { data: movs, error } = await supabase
    .from("movimentacoes")
    .select("Id_PPV, Qtde, Preco, Descricao, TipoMovimento, Data_Hora, CodProduto")
    .in("CodProduto", variantes(codigo))
    .eq("TipoMovimento", "Saída");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Agrupa por PPV, somando a quantidade.
  const porPpv = new Map<string, { qtde: number; descricao: string; preco: number }>();
  for (const m of movs || []) {
    const id = String(m.Id_PPV);
    const cur = porPpv.get(id) || { qtde: 0, descricao: m.Descricao || "", preco: Number(m.Preco) || 0 };
    cur.qtde += Number(m.Qtde) || 0;
    if (!cur.descricao && m.Descricao) cur.descricao = m.Descricao;
    porPpv.set(id, cur);
  }

  const ids = [...porPpv.keys()];
  let pedidos: Record<string, any>[] = [];
  if (ids.length) {
    const { data: peds } = await supabase
      .from("pedidos")
      .select("id_pedido, cliente, tecnico, status, data, Tipo_Pedido, valor_total")
      .in("id_pedido", ids);
    pedidos = peds || [];
  }
  const pedMap = new Map(pedidos.map((p) => [String(p.id_pedido), p]));

  const lista = ids.map((id) => {
    const g = porPpv.get(id)!;
    const p = pedMap.get(id) || {};
    return {
      id, quantidade: g.qtde, descricao: g.descricao, preco: g.preco,
      cliente: p.cliente || "—", tecnico: p.tecnico || "", status: p.status || "—",
      data: p.data || null, tipo: p.Tipo_Pedido || "", total: Number(p.valor_total) || 0,
    };
  }).sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));

  const emAberto = lista.filter((x) => !/conclu|cancel/i.test(String(x.status)));
  return NextResponse.json({
    codigo, total_ppvs: lista.length, em_aberto: emAberto.length,
    total_qtde: lista.reduce((s, x) => s + x.quantidade, 0), ppvs: lista,
  });
}
