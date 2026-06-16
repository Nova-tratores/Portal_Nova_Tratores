import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// limpa caracteres que quebram o filtro .or do PostgREST
const limpo = (s: string) => s.replace(/[%,()*]/g, " ").trim();

export async function GET(req: NextRequest) {
  const acao = req.nextUrl.searchParams.get("acao") || "secoes";
  const modelo = req.nextUrl.searchParams.get("modelo");
  try {
    // Tratores (modelos) com contagem de figuras/peças
    if (acao === "modelos") {
      const { data: modelos, error } = await supabase
        .from("catalogo_modelos")
        .select("slug, nome, image_url, ordem")
        .order("ordem", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const { data: figs } = await supabase.from("catalogo_figuras").select("modelo");
      const cont: Record<string, number> = {};
      for (const f of figs || []) cont[f.modelo || ""] = (cont[f.modelo || ""] || 0) + 1;
      return NextResponse.json((modelos || []).map((m) => ({ ...m, figuras: cont[m.nome] || 0 })));
    }

    // Seções com contagem de figuras
    if (acao === "secoes") {
      let qs = supabase
        .from("catalogo_figuras")
        .select("secao, secao_ordem, ordem, thumb_url, image_url")
        .order("secao_ordem", { ascending: true })
        .order("ordem", { ascending: true });
      if (modelo) qs = qs.eq("modelo", modelo);
      const { data, error } = await qs;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const map = new Map<string, { secao: string; ordem: number; figuras: number; thumb: string | null }>();
      for (const f of data || []) {
        const s = f.secao || "Outros";
        if (!map.has(s)) map.set(s, { secao: s, ordem: f.secao_ordem ?? 99, figuras: 0, thumb: null });
        const o = map.get(s)!;
        o.figuras++;
        if (!o.thumb) o.thumb = f.image_url || f.thumb_url || null; // imagem da 1ª figura da seção
      }
      return NextResponse.json([...map.values()].sort((a, b) => a.ordem - b.ordem));
    }

    // Figuras (de uma seção, ou todas)
    if (acao === "figuras") {
      const secao = req.nextUrl.searchParams.get("secao");
      let q = supabase
        .from("catalogo_figuras")
        .select("id, code, name, secao, thumb_url, image_url, ordem")
        .order("ordem", { ascending: true });
      if (secao) q = q.eq("secao", secao);
      if (modelo) q = q.eq("modelo", modelo);
      const { data, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data || []);
    }

    // Busca por nome ou código (peças) + a figura de cada uma
    if (acao === "busca") {
      const raw = (req.nextUrl.searchParams.get("q") || "").trim();
      const q = limpo(raw);
      if (q.length < 2) return NextResponse.json([]);
      let pq = supabase
        .from("catalogo_pecas")
        .select("id, code, name, reference, qtd, unit, figura_id")
        .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
        .limit(60);
      if (modelo) pq = pq.eq("modelo", modelo);
      const { data: pecas, error } = await pq;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const figIds = [...new Set((pecas || []).map((p) => p.figura_id))];
      let figMap: Record<string, any> = {};
      if (figIds.length) {
        const { data: figs } = await supabase
          .from("catalogo_figuras")
          .select("id, code, name, secao, thumb_url")
          .in("id", figIds);
        figMap = Object.fromEntries((figs || []).map((f) => [f.id, f]));
      }
      // prioriza match exato/início de código
      const ql = q.toLowerCase();
      const result = (pecas || [])
        .map((p) => ({ ...p, figura: figMap[p.figura_id] || null }))
        .sort((a, b) => {
          const sa = (a.code || "").toLowerCase().startsWith(ql) ? 0 : 1;
          const sb = (b.code || "").toLowerCase().startsWith(ql) ? 0 : 1;
          return sa - sb;
        });
      return NextResponse.json(result);
    }

    // Robô de ajuda: linguagem natural → detecta trator + palavras-chave → peças
    if (acao === "robo") {
      const raw = (req.nextUrl.searchParams.get("q") || "").trim();
      if (raw.length < 2) return NextResponse.json({ modelo: null, termos: [], pecas: [] });
      const ql = " " + raw.toLowerCase() + " ";

      const { data: modelos } = await supabase.from("catalogo_modelos").select("nome");
      let modeloDet: string | null = null;
      // 1) nome completo do trator citado
      for (const m of modelos || []) {
        const n = (m.nome || "").toLowerCase();
        if (n && ql.includes(n)) { modeloDet = m.nome; break; }
      }
      // 2) por token do nome (ex: "6065", "86-110", "jivo")
      if (!modeloDet) {
        for (const m of modelos || []) {
          const toks: string[] = (m.nome || "").toLowerCase().match(/[a-z0-9-]{3,}/g) || [];
          if (toks.some((t: string) => ql.includes(" " + t) || ql.includes(t + " "))) { modeloDet = m.nome; break; }
        }
      }

      const STOP = new Set(["preciso", "quero", "queria", "dos", "das", "para", "pra", "por", "com", "uma", "peca", "peça", "pecas", "peças", "trator", "manda", "achar", "ver", "mostrar", "mostra", "qual", "onde", "esta", "está", "que", "tem", "the", "agua"]);
      const modLow = (modeloDet || "").toLowerCase();
      const termos = limpo(ql)
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP.has(w) && !modLow.includes(w));

      if (termos.length === 0) return NextResponse.json({ modelo: modeloDet, termos, pecas: [] });

      const buscar = async (and: boolean) => {
        let q = supabase.from("catalogo_pecas").select("id, code, name, reference, qtd, unit, figura_id").limit(60);
        if (modeloDet) q = q.eq("modelo", modeloDet);
        if (and) for (const t of termos) q = q.ilike("name", `%${t}%`);
        else q = q.or(termos.map((t) => `name.ilike.%${t}%`).join(","));
        const { data } = await q;
        return data || [];
      };
      let pecas = await buscar(true);
      if (pecas.length === 0) pecas = await buscar(false); // afrouxa se o AND não achou

      const figIds = [...new Set(pecas.map((p) => p.figura_id))];
      let figMap: Record<string, any> = {};
      if (figIds.length) {
        const { data: figs } = await supabase.from("catalogo_figuras").select("id, code, name, secao, modelo, thumb_url").in("id", figIds);
        figMap = Object.fromEntries((figs || []).map((f) => [f.id, f]));
      }
      return NextResponse.json({ modelo: modeloDet, termos, pecas: pecas.map((p) => ({ ...p, figura: figMap[p.figura_id] || null })) });
    }

    return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
