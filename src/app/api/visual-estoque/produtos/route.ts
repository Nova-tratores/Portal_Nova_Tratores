import { NextRequest, NextResponse } from "next/server";
import { buscarProdutosEnriquecidos, agruparFamilias, buscarPecasPorTipo, buscarMaquinasDemonstracao, autoDistribuir } from "@/lib/visual-estoque/data";

export async function GET(req: NextRequest) {
  const conta = req.nextUrl.searchParams.get("conta") || undefined;
  const modo = req.nextUrl.searchParams.get("modo") || "todos";

  try {
    const produtos = await buscarProdutosEnriquecidos(conta);

    if (modo === "dashboard") {
      const maquinas = produtos.filter(p => p.tipo !== "Peças" && p.estoque > 0);
      const familias = agruparFamilias(maquinas);
      const pecasTipo = await buscarPecasPorTipo(conta);

      const totalProdutos = maquinas.length;
      const valorTotalEstoque = maquinas.reduce((s, p) => s + p.valor_estoque, 0);
      const custoCapitalTotal = maquinas.reduce((s, p) => s + p.custo_capital, 0);
      const custoCapitalMes = maquinas.reduce((s, p) => s + p.custo_capital_mes, 0);

      const pecas = produtos.filter(p => p.tipo === "Peças" && p.estoque > 0);
      const qtdPecas = pecas.length;
      const qtdUnidades = pecas.reduce((s, p) => s + p.estoque, 0);
      const valorPecas = pecas.reduce((s, p) => s + p.valor_estoque, 0);

      return NextResponse.json({
        totalProdutos, valorTotalEstoque, custoCapitalTotal, custoCapitalMes,
        familias, pecas: { qtdPecas, qtdUnidades, valor: valorPecas }, pecasTipo,
      });
    }

    if (modo === "alertas") {
      const semEstoque = produtos.filter(p => p.estoque <= 0 && !p.inativo);
      const baixoEstoque = produtos.filter(p => p.estoque > 0 && p.estoque <= 5 && !p.inativo);
      return NextResponse.json({ semEstoque, baixoEstoque });
    }

    if (modo === "patio") {
      const maquinas = produtos.filter(p => p.tipo !== "Peças" && p.estoque > 0);
      const demonstracao = await buscarMaquinasDemonstracao(conta);

      const ambientes: Record<string, typeof maquinas> = {
        patio: [], showroom: [], oficina: [], oficina2: [], barracao: [], fartura: [], demonstracao: [],
      };
      for (const m of maquinas) {
        // 'showroom' é o ambiente padrão para máquinas sem ambiente definido.
        const amb = m.ambiente && ambientes[m.ambiente] ? m.ambiente : "showroom";
        ambientes[amb].push(m);
      }
      ambientes.demonstracao = demonstracao;

      // Distribui posições automáticas por ambiente para quem não tem pos salvo.
      for (const amb of Object.keys(ambientes)) autoDistribuir(ambientes[amb]);

      const familias = agruparFamilias(maquinas);
      return NextResponse.json({ ambientes, familias, total: maquinas.length });
    }

    // showroom: todos com filtros client-side
    return NextResponse.json(produtos.filter(p => !p.inativo));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
