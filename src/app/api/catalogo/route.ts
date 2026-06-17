import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getIA, chamarIA } from "@/lib/assistente/ia";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// limpa caracteres que quebram o filtro .or do PostgREST
const limpo = (s: string) => s.replace(/[%,()*]/g, " ").trim();

// Interpreta a pergunta com a IA (OpenAI/Groq, se houver chave): extrai trator + termos + códigos.
// Retorna null se não houver chave ou se falhar (cai pra heurística local).
async function interpretarGroq(query: string, modelosNomes: string[]): Promise<{ modelo: string | null; termos: string[]; codigos: string[] } | null> {
  if (!getIA().key) return null;
  const sys = `Você ajuda a achar peças de tratores Mahindra num catálogo de peças.
Tratores disponíveis: ${modelosNomes.join(", ")}.
Dada a pergunta do usuário, responda APENAS um JSON válido:
{"modelo": "<nome EXATO de um trator da lista, ou null se não citado>", "termos": ["<palavra-chave de nome de peça em português, COM acentos corretos>"], "codigos": ["<código de peça citado pelo usuário, se houver>"]}
Regras:
- O PRIMEIRO termo deve ser a PEÇA principal que a pessoa quer. Em "correia do motor", a peça é "correia" (motor é só o conjunto/local). Não coloque palavras genéricas de local (motor, trator, cabine) como termo PRINCIPAL quando houver uma peça específica.
- CORRIJA erros de digitação comuns do português: carreia→correia, parafso→parafuso, mangeira→mangueira, rolamneto→rolamento, junda→junta, filtor→filtro, etc.
- Expanda sinônimos (junta/vedação/retentor, bomba d'água, vela de aquecimento, correia/correia em V).
- Use 1 a 5 termos de UMA palavra cada (nunca frases). Ex.: pergunta "me fala o código da carreia do motor do 86-110" → {"modelo":"86-110","termos":["correia","motor"],"codigos":[]}. COM acentos. NÃO invente códigos.`;
  try {
    const j = await chamarIA({
      temperature: 0.2,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: query }],
    });
    const p = JSON.parse(j?.choices?.[0]?.message?.content || "{}");
    const modelo = typeof p.modelo === "string" && modelosNomes.includes(p.modelo) ? p.modelo : null;
    const termos = Array.isArray(p.termos) ? p.termos.filter((t: any) => typeof t === "string" && t.trim().length >= 2).map((t: string) => t.trim()).slice(0, 8) : [];
    // só aceita código que o usuário REALMENTE escreveu (evita código inventado pela IA)
    const ql = query.toLowerCase();
    const codigos = Array.isArray(p.codigos) ? p.codigos.filter((c: any) => typeof c === "string" && c.trim().length >= 4 && ql.includes(c.trim().toLowerCase())).map((c: string) => c.trim()).slice(0, 5) : [];
    return { modelo, termos, codigos };
  } catch { return null; }
}

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

    // Robô de ajuda: linguagem natural → (Groq ou heurística) → peças agrupadas por código + tratores
    if (acao === "robo") {
      const raw = (req.nextUrl.searchParams.get("q") || "").trim();
      if (raw.length < 2) return NextResponse.json({ modelo: null, termos: [], grupos: [], ia: false });
      const ql = " " + raw.toLowerCase() + " ";

      const { data: modelos } = await supabase.from("catalogo_modelos").select("nome");
      const modelosNomes = (modelos || []).map((m) => m.nome).filter(Boolean);

      // Interpretação: Groq se houver chave; senão heurística local
      let interp = await interpretarGroq(raw, modelosNomes);
      const usouIA = !!interp;
      if (!interp) {
        let modeloDet: string | null = null;
        for (const m of modelos || []) { const n = (m.nome || "").toLowerCase(); if (n && ql.includes(n)) { modeloDet = m.nome; break; } }
        if (!modeloDet) for (const m of modelos || []) { const toks: string[] = (m.nome || "").toLowerCase().match(/[a-z0-9-]{3,}/g) || []; if (toks.some((t: string) => ql.includes(" " + t) || ql.includes(t + " "))) { modeloDet = m.nome; break; } }
        const codeTok = (raw.match(/[A-Za-z0-9./-]{5,}/g) || []).find((t: string) => (t.match(/[0-9]/g) || []).length >= 3);
        if (codeTok) interp = { modelo: modeloDet, termos: [], codigos: [codeTok] };
        else {
          const STOP = new Set(["preciso", "quero", "queria", "dos", "das", "para", "pra", "por", "com", "uma", "peca", "peça", "pecas", "peças", "trator", "manda", "achar", "ver", "mostrar", "mostra", "qual", "onde", "esta", "está", "que", "tem", "the", "agua", "codigo", "código", "fala", "diz"]);
          // correções de digitação mais comuns (rede de segurança quando a IA está fora)
          const CORR: Record<string, string> = { carreia: "correia", coreia: "correia", correa: "correia", parafso: "parafuso", parafuzo: "parafuso", mangeira: "mangueira", manguera: "mangueira", rolamneto: "rolamento", rolameto: "rolamento", junda: "junta", filtor: "filtro", oleo: "óleo", retetor: "retentor", vedacao: "vedação" };
          const modLow = (modeloDet || "").toLowerCase();
          interp = { modelo: modeloDet, termos: limpo(ql).split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w) && !modLow.includes(w)).map((w) => CORR[w] || w), codigos: [] };
        }
      }

      const termosShow = [...interp.termos, ...interp.codigos];
      // Quebra os termos em PALAVRAS (a IA às vezes manda "correia do motor" como frase) e remove conectores.
      // A ordem é preservada: a peça principal (1ª palavra significativa) fica em primeiro.
      const CONECT = new Set(["do", "da", "de", "dos", "das", "com", "para", "pra", "no", "na", "nos", "nas", "e", "ou", "em"]);
      const termosLimpos = [...new Set(interp.termos.flatMap((t) => limpo(t).split(/\s+/)).map((w) => w.trim()).filter((w) => w.length >= 3 && !CONECT.has(w)))];
      const codigosLimpos = interp.codigos.map((c) => limpo(c)).filter((c) => c.length >= 3);
      if (termosLimpos.length === 0 && codigosLimpos.length === 0) {
        return NextResponse.json({ modelo: interp.modelo, termos: termosShow, grupos: [], ia: usouIA });
      }

      const SEL = "id, code, name, reference, qtd, unit, figura_id, modelo";
      let pecas: any[] = [];
      if (codigosLimpos.length > 0) {
        // usuário citou código → busca por código (em todos os tratores, salvo se citou um)
        let q = supabase.from("catalogo_pecas").select(SEL).or(codigosLimpos.map((c) => `code.ilike.%${c}%`).join(",")).limit(200);
        if (interp.modelo) q = q.eq("modelo", interp.modelo);
        pecas = (await q).data || [];
      } else {
        // Busca em camadas: 1) AND (todas as palavras) → 2) só o termo PRINCIPAL → 3) OR (qualquer).
        // Isso evita que um termo genérico (ex.: "motor") soterre a peça específica (ex.: "correia").
        const buscarAnd = async () => {
          let q = supabase.from("catalogo_pecas").select(SEL).limit(200);
          if (interp.modelo) q = q.eq("modelo", interp.modelo);
          for (const t of termosLimpos) q = q.ilike("name", `%${t}%`);
          return (await q).data || [];
        };
        const buscarUm = async (t: string) => {
          let q = supabase.from("catalogo_pecas").select(SEL).ilike("name", `%${t}%`).limit(200);
          if (interp.modelo) q = q.eq("modelo", interp.modelo);
          return (await q).data || [];
        };
        const buscarOr = async () => {
          let q = supabase.from("catalogo_pecas").select(SEL).or(termosLimpos.map((t) => `name.ilike.%${t}%`).join(",")).limit(200);
          if (interp.modelo) q = q.eq("modelo", interp.modelo);
          return (await q).data || [];
        };
        pecas = await buscarAnd();
        if (pecas.length === 0 && termosLimpos.length > 1) pecas = await buscarUm(termosLimpos[0]); // só a peça principal
        if (pecas.length === 0) pecas = await buscarOr();
      }

      const figIds = [...new Set(pecas.map((p) => p.figura_id))];
      let figMap: Record<string, any> = {};
      if (figIds.length) {
        const { data: figs } = await supabase.from("catalogo_figuras").select("id, code, name, secao, modelo").in("id", figIds);
        figMap = Object.fromEntries((figs || []).map((f) => [f.id, f]));
      }

      // Agrupa por CÓDIGO → lista de tratores onde a peça aparece
      const grupos = new Map<string, any>();
      for (const p of pecas) {
        const fig = figMap[p.figura_id];
        if (!grupos.has(p.code)) grupos.set(p.code, { code: p.code, name: p.name, qtd: p.qtd, unit: p.unit, tratores: [] });
        const g = grupos.get(p.code);
        const modelo = p.modelo || (fig && fig.modelo) || "";
        if (modelo && !g.tratores.some((t: any) => t.modelo === modelo && t.figura_id === p.figura_id)) {
          g.tratores.push({ modelo, secao: fig ? fig.secao : "", figura_code: fig ? fig.code : "", figura_id: p.figura_id });
        }
      }
      // Ranking: prioriza quem casa com o termo PRINCIPAL (e melhor ainda se começa com ele), depois nº de tratores
      const principal = (termosLimpos[0] || "").toLowerCase();
      const rel = (nome: string) => {
        const n = (nome || "").toLowerCase();
        if (!principal) return 2;
        if (n.startsWith(principal)) return 0;
        if (n.includes(principal)) return 1;
        return 2;
      };
      const lista = [...grupos.values()].sort((a, b) => {
        const ra = rel(a.name), rb = rel(b.name);
        if (ra !== rb) return ra - rb;
        return b.tratores.length - a.tratores.length;
      });
      return NextResponse.json({ modelo: interp.modelo, termos: termosShow, grupos: lista, ia: usouIA });
    }

    return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
