import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TIPOS_PEDIDO, MOTIVOS_SAIDA } from "@/lib/ppv/constants";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// Cria (ou inclui) um PPV/Orçamento a partir dos itens do carrinho do catálogo.
// body: {
//   tipo:'ppv'|'orcamento', items:[{codigo,descricao,quantidade}], userName?, observacao?,
//   cliente:{nome,documento,endereco,cidade},   // obrigatório ao CRIAR novo
//   tecnico?,                                    // obrigatório ao criar novo PPV
//   alvoId?                                      // se presente: INCLUI nesse doc existente
// }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tipo = body.tipo;
    const itensIn: any[] = Array.isArray(body.items) ? body.items : [];
    const cliente = body.cliente || {};
    const userName = (body.userName || "Catálogo").toString();
    const tecnico = (body.tecnico || "").toString().trim();
    const alvoId = body.alvoId ? String(body.alvoId).trim() : "";
    const incluir = !!alvoId;
    if (itensIn.length === 0) return NextResponse.json({ error: "Carrinho vazio." }, { status: 400 });
    if (!incluir && !cliente.nome) return NextResponse.json({ error: "Selecione o cliente." }, { status: 400 });
    if (tipo === "ppv" && !incluir && !tecnico) return NextResponse.json({ error: "Informe o técnico do PPV." }, { status: 400 });

    // Resolve preço de cada item pelo código (Produtos_Completos).
    // O código do catálogo vem SEM o prefixo "RP-" (000016299P04); no Omie ele
    // está COM (RP-000016299P04). Buscamos as duas formas e gravamos o código
    // REAL do Omie (o que casou) — é ele que o PPV precisa pra faturar.
    const variantes = (c: string) => {
      const base = c.trim();
      const semRp = base.replace(/^RP-/i, "");
      return [...new Set([base, semRp, `RP-${semRp}`])];
    };
    const resolvidos: { codigo: string; descricao: string; quantidade: number; preco: number }[] = [];
    let semPreco = 0;
    for (const it of itensIn) {
      const codigo = String(it.codigo || "").trim();
      if (!codigo) continue;
      const quantidade = Number(it.quantidade) || 1;
      let preco = 0;
      let descricao = it.descricao || codigo;
      let codigoFinal = codigo;
      const { data } = await supabase
        .from("Produtos_Completos")
        .select("Codigo_Produto, Descricao_Produto, Preco_Venda")
        .in("Codigo_Produto", variantes(codigo))
        .limit(1);
      if (data && data[0]) {
        preco = parseFloat(String(data[0].Preco_Venda || 0)) || 0;
        if (data[0].Descricao_Produto) descricao = data[0].Descricao_Produto;
        if (data[0].Codigo_Produto) codigoFinal = String(data[0].Codigo_Produto).trim();
      }
      if (!preco) semPreco++;
      resolvidos.push({ codigo: codigoFinal, descricao, quantidade, preco });
    }
    const total = resolvidos.reduce((s, i) => s + i.quantidade * i.preco, 0);

    // PPV não aceita peça sem preço (não cadastrada no Omie).
    if (tipo === "ppv" && semPreco > 0) {
      return NextResponse.json({ error: `${semPreco} peça(s) não cadastrada(s) no Omie — cadastre antes de gerar/incluir no PPV.` }, { status: 400 });
    }

    if (tipo === "orcamento") {
      if (incluir) {
        const { data: orc } = await supabase.from("orcamentos").select("id, numero, itens, total, status").eq("id", alvoId).maybeSingle();
        if (!orc) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });
        if (/conclu|cancel/i.test(String(orc.status || ""))) return NextResponse.json({ error: "Este orçamento está concluído ou cancelado — não dá pra incluir peças." }, { status: 409 });
        const atuais = Array.isArray(orc.itens) ? orc.itens : [];
        const novos = [...atuais, ...resolvidos];
        const novoTotal = novos.reduce((s: number, i: any) => s + (Number(i.quantidade) || 1) * (Number(i.preco) || 0), 0);
        const { error } = await supabase.from("orcamentos").update({ itens: novos, total: novoTotal }).eq("id", alvoId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, tipo: "orcamento", id: orc.id, numero: orc.numero, incluido: true, total: novoTotal, semPreco });
      }
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
      if (incluir) {
        // Não deixa incluir peça num PPV já concluído ou cancelado.
        const { data: alvo } = await supabase.from("pedidos").select("status").eq("id", alvoId).maybeSingle();
        if (alvo && /conclu|cancel/i.test(String(alvo.status || ""))) {
          return NextResponse.json({ error: "Este PPV está concluído ou cancelado — não dá pra incluir peças." }, { status: 409 });
        }
        const r = await fetch(`${req.nextUrl.origin}/api/ppv/movimentacoes`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: alvoId, itens: resolvidos, kit: "Catálogo", tecnico: tecnico || userName, userName }),
        });
        if (!r.ok) { const j = await r.json().catch(() => ({})); return NextResponse.json({ error: j?.error || "Erro ao incluir no PPV." }, { status: 500 }); }
        return NextResponse.json({ ok: true, tipo: "ppv", id: alvoId, incluido: true, total, semPreco });
      }
      const ppvBody = {
        tipoPedido: TIPOS_PEDIDO[0].value,
        motivoSaida: MOTIVOS_SAIDA[0].value,
        tecnico: tecnico || userName,
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
