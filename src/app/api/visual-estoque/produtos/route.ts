import { NextRequest, NextResponse } from "next/server";
import { buscarProdutosEnriquecidos, agruparFamilias, buscarPecasPorTipo, buscarMaquinasDemonstracao, autoDistribuir } from "@/lib/visual-estoque/data";
import { protegerRota, type OpcaoAcesso } from "@/lib/ajustes/permissao-server";

// Permissão = a da tela que pede cada modo: a Home (dashboard) é temAcesso('consulta-estoque');
// as outras são pode('consulta-estoque', <tela>). Showroom é o modo padrão.
function acessoDoModo(modo: string): OpcaoAcesso[] {
  if (modo === "dashboard") return [{ modulo: "consulta-estoque" }];
  if (modo === "alertas") return [{ modulo: "consulta-estoque", acao: "alertas" }];
  if (modo === "patio") return [{ modulo: "consulta-estoque", acao: "patio" }];
  return [{ modulo: "consulta-estoque", acao: "showroom" }];
}

// Famílias que NÃO são máquinas e ficam fora do pátio (igual ao app legado:
// server.js familiasOcultasPatio). O pátio mostra só máquinas, não peças.
const FAMILIAS_OCULTAS_PATIO = ["Peças", "Agricultura de Precisão"];

export async function GET(req: NextRequest) {
  const conta = req.nextUrl.searchParams.get("conta") || undefined;
  const modo = req.nextUrl.searchParams.get("modo") || "todos";
  const g = await protegerRota(req, acessoDoModo(modo));
  if (g.resposta) return g.resposta;

  try {
    const produtos = await buscarProdutosEnriquecidos(conta);

    if (modo === "dashboard") {
      // Máquina vs peça é definido pela FAMÍLIA (familia_nome), não por `tipo`
      // (igual ao app legado). 'tipo' é uma característica livre e não confiável.
      const maquinas = produtos.filter(p => p.familia_nome !== "Peças" && p.estoque > 0);
      const familias = agruparFamilias(maquinas);
      const pecasTipo = await buscarPecasPorTipo(conta);

      const totalProdutos = maquinas.length;
      const valorTotalEstoque = maquinas.reduce((s, p) => s + p.valor_estoque, 0);
      const custoCapitalTotal = maquinas.reduce((s, p) => s + p.custo_capital, 0);
      const custoCapitalMes = maquinas.reduce((s, p) => s + p.custo_capital_mes, 0);

      const pecas = produtos.filter(p => p.familia_nome === "Peças" && p.estoque > 0);
      const qtdPecas = pecas.length;
      const qtdUnidades = pecas.reduce((s, p) => s + p.estoque, 0);
      const valorPecas = pecas.reduce((s, p) => s + p.valor_estoque, 0);

      return NextResponse.json({
        totalProdutos, valorTotalEstoque, custoCapitalTotal, custoCapitalMes,
        familias, pecas: { qtdPecas, qtdUnidades, valor: valorPecas }, pecasTipo,
      });
    }

    if (modo === "alertas") {
      // A tela Alertas só usa estes campos: custo (cmc, valor_estoque, custo_capital…)
      // não sai daqui.
      const enxuto = (p: (typeof produtos)[number]) => ({
        codigo_produto: p.codigo_produto, codigo: p.codigo, descricao: p.descricao,
        familia_nome: p.familia_nome, estoque: p.estoque,
      });
      const semEstoque = produtos.filter(p => p.estoque <= 0 && !p.inativo).map(enxuto);
      const baixoEstoque = produtos.filter(p => p.estoque > 0 && p.estoque <= 5 && !p.inativo).map(enxuto);
      return NextResponse.json({ semEstoque, baixoEstoque });
    }

    if (modo === "patio") {
      const maquinas = produtos.filter(p => !FAMILIAS_OCULTAS_PATIO.includes(p.familia_nome) && p.estoque > 0);
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
