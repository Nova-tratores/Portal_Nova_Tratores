// GET /api/estoque/produto-dados?conta=NOVA&codigoProduto=123
// Dados DB-first do produto p/ a aba "Dados do Produto" do Item de Orçamento e o
// modal de detalhe (cmc, preço, família, vendas, última entrada, histórico com
// vendedor, características). Descrição detalhada via lazy-fill (ver o lib).
import { NextRequest, NextResponse } from "next/server";
import { parseConta, CONTA_DEFAULT } from "@/lib/estoque/conta";
import { obterProdutoDados } from "@/lib/estoque/produto-dados";
import { autenticar } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const conta = parseConta(req.nextUrl.searchParams.get("conta")) || CONTA_DEFAULT;
  const codigoProdutoRaw = Number(req.nextUrl.searchParams.get("codigoProduto"));
  const codigoProduto = Number.isFinite(codigoProdutoRaw) && codigoProdutoRaw > 0 ? codigoProdutoRaw : undefined;
  const codigo = req.nextUrl.searchParams.get("codigo") || undefined;
  if (!codigoProduto && !codigo) {
    return NextResponse.json({ error: "codigoProduto ou codigo obrigatório" }, { status: 400 });
  }

  try {
    const dados = await obterProdutoDados(conta, { codigoProduto, codigo });
    return NextResponse.json(dados);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error(`[API produto-dados] ${codigoProduto ?? codigo}/${conta}: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
