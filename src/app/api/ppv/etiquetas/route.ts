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
    const itens = data || [];

    // Busca por LOCAÇÃO em dois formatos:
    //   rotulado:   "PRATELEIRA 6", "ANDAR H", "CAIXA 03" (com sobras de
    //               texto filtrando a descrição: "rolamento prateleira 6")
    //   posicional: "3 G 1" ou "3G1" = #PRATELEIRA/#ANDAR/#CAIXA na ordem
    // Filtro direto na chave do JSONB (caracteristicas->>#CHAVE): ilike pra
    // letra (case-insensitive) e in() com variantes pra número ("3" acha
    // "03" e vice-versa). JSON não entra no or= do PostgREST → consulta
    // separada com merge deduplicado.
    const CHAVES = ["#PRATELEIRA", "#ANDAR", "#CAIXA"];
    const brutos = seguro.toUpperCase();
    const pares: [string, string][] = [];
    const reRotulo = /\b(PRATELEIRAS?|ANDAR(?:ES)?|CAIXAS?)\s*[:=]?\s*([A-Z0-9]{1,4})\b/g;
    let mRot: RegExpExecArray | null;
    while ((mRot = reRotulo.exec(brutos))) {
      const chave = mRot[1].startsWith("PRATELEIRA") ? "#PRATELEIRA" : mRot[1].startsWith("ANDAR") ? "#ANDAR" : "#CAIXA";
      pares.push([chave, mRot[2]]);
    }
    const restoDescricao = pares.length > 0
      ? brutos.replace(/\b(PRATELEIRAS?|ANDAR(?:ES)?|CAIXAS?)\s*[:=]?\s*([A-Z0-9]{1,4})\b/g, " ").replace(/\s+/g, " ").trim()
      : "";
    if (pares.length === 0) {
      const tokens = (/\s/.test(seguro) ? seguro.split(/[\s\-./]+/) : seguro.match(/\d+|[a-zA-Z]+/g) || [])
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      if (tokens.length >= 1 && tokens.length <= 3 && tokens.every((t) => t.length <= 4)) {
        tokens.forEach((t, i) => { pares.push([CHAVES[i], t]); });
      }
    }
    if (pares.length > 0) {
      let qy = supabase
        .from("produtos_caracteristicas")
        .select("conta_omie, codigo, descricao, caracteristicas");
      for (const [chave, valor] of pares) {
        const path = `caracteristicas->>${chave}`;
        if (/^\d+$/.test(valor)) {
          const semZeros = String(Number(valor));
          qy = qy.in(path, [...new Set([valor, semZeros, semZeros.padStart(2, "0")])]);
        } else {
          qy = qy.ilike(path, valor);
        }
      }
      if (restoDescricao.length >= 2) qy = qy.ilike("descricao", `%${restoDescricao}%`);
      const { data: porLocacao } = await qy.order("descricao").limit(120);
      const vistos = new Set(itens.map((p) => `${p.conta_omie}|${p.codigo}`));
      for (const p of porLocacao || []) {
        const k = `${p.conta_omie}|${p.codigo}`;
        if (!vistos.has(k)) { vistos.add(k); itens.push(p); }
      }
    }
    return NextResponse.json({ itens: itens.slice(0, 150) });
  } catch (e) {
    return NextResponse.json(
      { itens: [], error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
