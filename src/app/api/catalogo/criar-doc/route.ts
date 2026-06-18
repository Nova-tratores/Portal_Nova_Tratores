import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TIPOS_PEDIDO, MOTIVOS_SAIDA } from "@/lib/ppv/constants";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// Cria um PPV ou um Orçamento a partir dos itens do carrinho do catálogo.
// body: { tipo:'ppv'|'orcamento', items:[{codigo,descricao,quantidade}], cliente:{nome,documento,endereco,cidade}, observacao?, userName? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tipo = body.tipo;
    const itensIn: any[] = Array.isArray(body.items) ? body.items : [];
    const cliente = body.cliente || {};
    const userName = (body.userName || "Catálogo").toString();
    if (!cliente.nome) return NextResponse.json({ error: "Selecione o cliente." }, { status: 400 });
    if (itensIn.length === 0) return NextResponse.json({ error: "Carrinho vazio." }, { status: 400 });

    // Resolve preço de cada item pelo código (Produtos_Completos)
    const resolvidos: { codigo: string; descricao: string; quantidade: number; preco: number }[] = [];
    let semPreco = 0;
    for (const it of itensIn) {
      const codigo = String(it.codigo || "").trim();
      if (!codigo) continue;
      const quantidade = Number(it.quantidade) || 1;
      let preco = 0;
      let descricao = it.descricao || codigo;
      const { data } = await supabase
        .from("Produtos_Completos")
        .select("Descricao_Produto, Preco_Venda")
        .eq("Codigo_Produto", codigo)
        .limit(1);
      if (data && data[0]) {
        preco = parseFloat(String(data[0].Preco_Venda || 0)) || 0;
        if (data[0].Descricao_Produto) descricao = data[0].Descricao_Produto;
      }
      if (!preco) semPreco++;
      resolvidos.push({ codigo, descricao, quantidade, preco });
    }
    const total = resolvidos.reduce((s, i) => s + i.quantidade * i.preco, 0);

    if (tipo === "orcamento") {
      const { data: ult } = await supabase.from("orcamentos").select("id").order("id", { ascending: false }).limit(1);
      const prox = ((ult && ult[0] && ult[0].id) || 0) + 1;
      const numero = `ORC-${String(prox).padStart(4, "0")}`;
      const payload = {
        tipo: "pecas",
        cliente_nome: cliente.nome,
        cliente_documento: cliente.documento || cliente.cnpj_cpf || null,
        cliente_endereco: cliente.endereco || null,
        cliente_cidade: cliente.cidade || null,
        observacao: body.observacao || null,
        validade: 15,
        itens: resolvidos,
        mao_obra: null,
        deslocamento: null,
        total,
        criado_por: userName,
        status: "ativo",
        numero,
      };
      const { data, error } = await supabase.from("orcamentos").insert([payload]).select("id, numero").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, tipo: "orcamento", id: data.id, numero: data.numero, total, semPreco });
    }

    if (tipo === "ppv") {
      const ppvBody = {
        tipoPedido: TIPOS_PEDIDO[0].value,
        motivoSaida: MOTIVOS_SAIDA[0].value,
        tecnico: userName,
        cliente: cliente.nome,
        observacao: body.observacao || "",
        valorTotal: total,
        userName,
        produtosSelecionados: resolvidos,
      };
      const r = await fetch(`${req.nextUrl.origin}/api/ppv/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ppvBody),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return NextResponse.json({ error: j?.error || "Erro ao criar PPV." }, { status: 500 });
      return NextResponse.json({ ok: true, tipo: "ppv", id: j.id || null, total, semPreco });
    }

    return NextResponse.json({ error: "tipo inválido (use ppv ou orcamento)" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
