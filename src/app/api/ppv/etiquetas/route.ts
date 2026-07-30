import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

// Busca de produtos pra ETIQUETAS de identificação (PPV): procura por código
// ou descrição em produtos_caracteristicas (sync de Ajustes — uma linha por
// conta Omie NOVA/CASTRO, com a locação #PRATELEIRA/#ANDAR/#CAIXA no JSON).
// Com ?recentes=1 devolve as ÚLTIMAS PEÇAS COMPRADAS (compras_itens = itens
// das NF-e de entrada do Omie), já com o cadastro da outra empresa quando o
// código existe nas duas — é o estado inicial da tela (peça que chegou é a
// que precisa de etiqueta).
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("recentes") === "1") {
    try {
      const { data: compras, error } = await supabase
        .from("compras_itens")
        .select("codigo_produto, data_nota, conta_omie")
        .order("ano", { ascending: false })
        .order("mes", { ascending: false })
        .order("id", { ascending: false })
        .limit(400);
      if (error) throw error;

      // dedupe (conta|código) mantendo a compra mais recente; top 40 chegadas
      const vistos = new Set<string>();
      const recentes: { codigo_produto: string; data_nota: string; conta_omie: string }[] = [];
      for (const c of compras || []) {
        const k = `${c.conta_omie}|${c.codigo_produto}`;
        if (!c.codigo_produto || vistos.has(k)) continue;
        vistos.add(k);
        recentes.push(c);
        if (recentes.length >= 40) break;
      }

      const codigos = [...new Set(recentes.map((c) => c.codigo_produto))];
      const { data: prods } = codigos.length
        ? await supabase
            .from("produtos_caracteristicas")
            .select("conta_omie, codigo, descricao, caracteristicas")
            .in("codigo", codigos)
        : { data: [] as never[] };
      const prodPor = new Map((prods || []).map((p) => [`${p.conta_omie}|${p.codigo}`, p]));
      const chegouPor = new Map(recentes.map((c) => [`${c.conta_omie}|${c.codigo_produto}`, c.data_nota]));

      const itens: Record<string, unknown>[] = [];
      const emitidos = new Set<string>();
      for (const c of recentes) {
        const outraConta = c.conta_omie === "NOVA" ? "CASTRO" : "NOVA";
        for (const conta of [c.conta_omie, outraConta]) {
          const k = `${conta}|${c.codigo_produto}`;
          if (emitidos.has(k)) continue;
          const p = prodPor.get(k);
          // a outra empresa só entra se o código existir no cadastro dela
          if (!p && conta !== c.conta_omie) continue;
          emitidos.add(k);
          itens.push({
            conta_omie: conta,
            codigo: c.codigo_produto,
            descricao: p?.descricao ?? null,
            caracteristicas: p?.caracteristicas ?? null,
            chegou: chegouPor.get(k) || null,
          });
        }
      }
      return NextResponse.json({ itens });
    } catch (e) {
      return NextResponse.json(
        { itens: [], error: e instanceof Error ? e.message : "erro" },
        { status: 500 },
      );
    }
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ itens: [] });
  // vírgula/parêntese quebram o filtro or= do PostgREST
  const seguro = q.replace(/[,()]/g, " ").trim();
  try {
    const { data, error } = await supabase
      .from("produtos_caracteristicas")
      .select("conta_omie, codigo, descricao, caracteristicas")
      .or(`codigo.ilike.%${seguro}%,descricao.ilike.%${seguro}%`)
      .order("descricao")
      .limit(120);
    if (error) throw error;
    return NextResponse.json({ itens: data || [] });
  } catch (e) {
    return NextResponse.json(
      { itens: [], error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
