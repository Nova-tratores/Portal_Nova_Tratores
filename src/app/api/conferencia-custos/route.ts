import { NextRequest, NextResponse } from "next/server";
import { supabaseVE } from "@/lib/visual-estoque/supabase";
import { buscarProdutosEnriquecidos, buscarMaquinasDemonstracao } from "@/lib/visual-estoque/data";

// Famílias que NÃO são máquinas (igual ao pátio). A conferência é só de máquinas.
const FAMILIAS_OCULTAS = ["Peças", "Agricultura de Precisão"];

// GET /api/conferencia-custos?conta=todas|nova|castro
// Lista cada máquina em estoque com o custo do portal (cmc) + os valores já
// conferidos (se existirem na tabela conferencia_custo_maquinas).
export async function GET(req: NextRequest) {
  const conta = req.nextUrl.searchParams.get("conta") || undefined;

  try {
    // Máquinas físicas em estoque + máquinas fora em demonstração/consignação
    // (ainda nossas — status Pendente em movimentacao_produtos, igual ao pátio).
    const [produtos, demo] = await Promise.all([
      buscarProdutosEnriquecidos(conta),
      buscarMaquinasDemonstracao(conta),
    ]);
    const maquinas = produtos.filter(
      (p) => !FAMILIAS_OCULTAS.includes(p.familia_nome) && p.estoque > 0 && !p.inativo
    );

    // Carrega as conferências já salvas e indexa por codigo_produto|conta_omie.
    const { data: salvas } = await supabaseVE
      .from("conferencia_custo_maquinas")
      .select("*");
    const idx = new Map<string, any>();
    for (const s of salvas || []) idx.set(`${s.codigo_produto}|${s.conta_omie}`, s);

    const montar = (m: any, origem: "estoque" | "demonstracao") => {
      const conf = idx.get(`${m.codigo_produto}|${m.conta_omie}`) || {};
      return {
        codigo_produto: m.codigo_produto,
        conta_omie: m.conta_omie,
        codigo: m.codigo,
        descricao: m.descricao,
        familia_nome: m.familia_nome,
        marca: m.marca,
        estoque: m.estoque,
        dias_em_estoque: m.dias_em_estoque,
        cmc_portal: m.cmc, // custo atual no portal (Custo Médio Contábil)
        origem, // 'estoque' (no pátio) ou 'demonstracao' (fora, em consignação)
        destinatario: m.destinatario ?? "", // p/ quem foi, quando em demonstração
        numero_remessa: m.numero_remessa ?? "",
        valor_remessa: origem === "demonstracao" ? m.valor_estoque : null, // valor de saída
        // valores conferidos com o fornecedor (null enquanto não preenchidos)
        fornecedor: conf.fornecedor ?? "",
        custo_pago: conf.custo_pago ?? null,
        custo_acumulado: conf.custo_acumulado ?? null,
        custo_fabrica: conf.custo_fabrica ?? null,
        contatado: conf.contatado ?? false,
        observacao: conf.observacao ?? "",
        atualizado_em: conf.atualizado_em ?? null,
        atualizado_por: conf.atualizado_por ?? null,
      };
    };

    const linhas = [
      ...maquinas.map((m) => montar(m, "estoque")),
      ...demo.map((m) => montar(m, "demonstracao")),
    ];

    // Estoque físico primeiro, depois demonstração; dentro de cada, por descrição.
    linhas.sort((a, b) =>
      a.origem !== b.origem
        ? a.origem === "estoque" ? -1 : 1
        : a.descricao.localeCompare(b.descricao, "pt-BR")
    );

    return NextResponse.json({ maquinas: linhas, total: linhas.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}

// POST /api/conferencia-custos — upsert de uma linha de conferência.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const codigo_produto = Number(body.codigo_produto);
    if (!codigo_produto) {
      return NextResponse.json({ erro: "codigo_produto obrigatório" }, { status: 400 });
    }

    // Converte string vazia em null para os campos numéricos.
    const num = (v: any) => (v === "" || v === null || v === undefined ? null : Number(v));

    const registro = {
      codigo_produto,
      conta_omie: body.conta_omie ?? "",
      codigo: body.codigo ?? null,
      descricao: body.descricao ?? null,
      cmc_portal: num(body.cmc_portal),
      fornecedor: body.fornecedor ?? null,
      custo_pago: num(body.custo_pago),
      custo_acumulado: num(body.custo_acumulado),
      custo_fabrica: num(body.custo_fabrica),
      contatado: !!body.contatado,
      observacao: body.observacao ?? null,
      atualizado_por: body.atualizado_por ?? null,
      atualizado_em: new Date().toISOString(),
    };

    const { error } = await supabaseVE
      .from("conferencia_custo_maquinas")
      .upsert(registro, { onConflict: "codigo_produto,conta_omie" });

    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
