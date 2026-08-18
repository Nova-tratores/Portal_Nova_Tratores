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

      // compras_itens.codigo_produto é MISTO: ora o ID interno da Omie (numérico,
      // por conta), ora o próprio SKU (ex.: "2733317/1"). produtos_caracteristicas
      // tem `codigo` (SKU, TEXT) e `codigo_produto` (ID Omie, BIGINT). Resolve por
      // AMBOS — só valores numéricos entram no filtro do bigint (senão dá erro).
      const vals = [...new Set(recentes.map((c) => String(c.codigo_produto)))];
      const ehNumero = (v: string) => /^[0-9]+$/.test(v);
      const numericos = vals.filter(ehNumero);
      const { data: porId } = numericos.length
        ? await supabase
            .from("produtos_caracteristicas")
            .select("conta_omie, codigo, codigo_produto, descricao, caracteristicas")
            .in("codigo_produto", numericos)
        : { data: [] as never[] };
      const idPor = new Map((porId || []).map((p) => [`${p.conta_omie}|${p.codigo_produto}`, p]));
      // SKUs a buscar = valores não-numéricos (já são SKU) + SKUs resolvidos por ID.
      // Query por SKU (TEXT, todas as empresas) → resolve os SKU-valued e o cruzamento.
      const skus = [...new Set([...vals.filter((v) => !ehNumero(v)), ...(porId || []).map((p) => p.codigo).filter(Boolean)])];
      const { data: porSku } = skus.length
        ? await supabase
            .from("produtos_caracteristicas")
            .select("conta_omie, codigo, descricao, caracteristicas")
            .in("codigo", skus)
        : { data: [] as never[] };
      const skuPor = new Map((porSku || []).map((p) => [`${p.conta_omie}|${p.codigo}`, p]));
      const chegouPor = new Map(recentes.map((c) => [`${c.conta_omie}|${c.codigo_produto}`, c.data_nota]));

      const itens: Record<string, unknown>[] = [];
      const emitidos = new Set<string>();
      for (const c of recentes) {
        const v = String(c.codigo_produto);
        const base = ehNumero(v) ? idPor.get(`${c.conta_omie}|${v}`) : skuPor.get(`${c.conta_omie}|${v}`);
        const sku = base?.codigo || (ehNumero(v) ? null : v);
        const chegou = chegouPor.get(`${c.conta_omie}|${c.codigo_produto}`) || null;
        // conta da compra: usa o SKU legível (fallback ao ID Omie se sem cadastro)
        const codBase = sku || String(c.codigo_produto);
        const kBase = `${c.conta_omie}|${codBase}`;
        if (!emitidos.has(kBase)) {
          emitidos.add(kBase);
          itens.push({
            conta_omie: c.conta_omie,
            codigo: codBase,
            descricao: base?.descricao ?? null,
            caracteristicas: base?.caracteristicas ?? null,
            chegou,
          });
        }
        // outra empresa: só entra se o SKU existir no cadastro dela
        if (sku) {
          const outra = c.conta_omie === "NOVA" ? "CASTRO" : "NOVA";
          const p2 = skuPor.get(`${outra}|${sku}`);
          const kOutra = `${outra}|${sku}`;
          if (p2 && !emitidos.has(kOutra)) {
            emitidos.add(kOutra);
            itens.push({
              conta_omie: outra,
              codigo: sku,
              descricao: p2.descricao ?? null,
              caracteristicas: p2.caracteristicas ?? null,
              chegou,
            });
          }
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
