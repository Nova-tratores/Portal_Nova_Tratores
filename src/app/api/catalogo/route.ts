import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getIA, chamarIA } from "@/lib/assistente/ia";
import { sanitizarFiltro } from "@/lib/busca-segura";

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

// O catálogo quase não muda (só quando se importa um catálogo novo), então vale
// cachear: navegar entre marca/modelo/seção deixa de bater no banco toda vez.
// Cache curto: segura a navegação (marca -> modelo -> seção) sem bater no banco a
// cada clique, mas uma correção aparece em ~1min. Com 5min+24h de stale, mudança
// no catálogo demorava demais pra chegar no navegador.
const CACHE = { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" };
const jsonCache = (data: unknown) => NextResponse.json(data, { headers: CACHE });

// Miniatura pela transformação do próprio Supabase Storage, em vez de servir a
// imagem cheia na grade. Os catálogos antigos guardavam em `thumbs/` uma CÓPIA da
// imagem original (238 KB!), então a grade baixava ~7 MB numa seção de 30 figuras.
// Aqui a mesma imagem sai com ~36 KB, sem precisar gerar/armazenar nada.
// 480 e não 320: os cards do catálogo foram aumentados (250–310px), e em tela
// retina isso pede ~2x a largura do card pra não sair macio.
// ATENÇÃO — custo: a transformação na hora (render/image?width=…) é cobrada pelo
// Supabase por CADA imagem distinta transformada no mês ("Storage Image
// Transformations"). Com 4.197 figuras isso estourou o incluído do plano.
// Solução: servir o arquivo ESTÁTICO direto (conta só como egress comum, barato).
// As miniaturas estáticas são geradas por scripts/thumbs-catalogo.mjs e o thumb_url
// já aponta pra elas; aqui só devolvemos a URL como está, SEM transformar.
function miniatura(url: string | null | undefined): string | null {
  return url || null;
}

export async function GET(req: NextRequest) {
  const acao = req.nextUrl.searchParams.get("acao") || "secoes";
  const modelo = req.nextUrl.searchParams.get("modelo");
  try {
    // Marcas que TÊM modelo no catálogo (com a logo e a contagem de modelos/tipos).
    // A tabela catalogo_marcas tem dezenas de marcas cadastradas; aqui só entram as
    // que realmente têm catálogo, senão a tela viraria uma lista de marcas vazias.
    if (acao === "marcas") {
      const { data: modelos, error } = await supabase.from("catalogo_modelos").select("marca, tipo, slug");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const porMarca = new Map<string, { modelos: number; tipos: Set<string> }>();
      for (const m of modelos || []) {
        const marca = String(m.marca || "").trim();
        if (!marca) continue;
        if (!porMarca.has(marca)) porMarca.set(marca, { modelos: 0, tipos: new Set() });
        const o = porMarca.get(marca)!;
        o.modelos++;
        if (m.tipo) o.tipos.add(String(m.tipo));
      }
      const { data: marcas } = await supabase.from("catalogo_marcas").select("nome, slug, logo_url, ordem");
      const logoPor: Record<string, { slug: string; logo_url: string | null; ordem: number }> = {};
      for (const m of marcas || []) {
        logoPor[String(m.nome || "").trim().toLowerCase()] = { slug: m.slug, logo_url: m.logo_url, ordem: m.ordem ?? 99 };
      }
      const out = [...porMarca.entries()].map(([nome, o]) => {
        const info = logoPor[nome.toLowerCase()];
        return {
          nome, slug: info?.slug || nome.toLowerCase(), logo_url: info?.logo_url || null,
          modelos: o.modelos, tipos: [...o.tipos].sort(),
        };
      }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      return jsonCache(out);
    }

    // Modelos (tratores/implementos) com contagem de figuras
    if (acao === "modelos") {
      // select("*") em vez de colunas fixas: assim a coluna "marca" entra quando existir,
      // sem quebrar se a migration ainda não tiver rodado.
      const { data: modelos, error } = await supabase
        .from("catalogo_modelos")
        .select("*")
        .order("ordem", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      // Contagem de figuras por modelo em UMA consulta (view agregada). Antes era
      // uma contagem por modelo — 76 idas ao banco só pra montar a lista.
      // Se a view ainda não existir, cai no caminho antigo.
      let comContagem: Record<string, unknown>[];
      const { data: agg, error: eAgg } = await supabase
        .from("vw_catalogo_modelo_figuras")
        .select("modelo, figuras");
      if (!eAgg && agg) {
        const porModelo = new Map<string, number>();
        for (const r of agg as { modelo: string; figuras: number }[]) porModelo.set(r.modelo, r.figuras);
        comContagem = (modelos || []).map((m) => ({ ...m, image_url: miniatura(m.image_url), figuras: porModelo.get(m.nome) || 0 }));
      } else {
        comContagem = await Promise.all(
          (modelos || []).map(async (m) => {
            const { count } = await supabase
              .from("catalogo_figura_modelos")
              .select("figura_id", { count: "exact", head: true })
              .eq("modelo", m.nome);
            return { ...m, figuras: count || 0 };
          })
        );
      }
      return jsonCache(comContagem);
    }

    // Seções com contagem de figuras
    if (acao === "secoes") {
      // Caminho rápido: view agregada (1 consulta leve). Antes puxava TODA figura
      // do modelo (com as URLs) só pra contar e escolher uma miniatura.
      if (modelo) {
        const { data: vs, error: eVs } = await supabase
          .from("vw_catalogo_secoes")
          .select("secao, ordem, figuras, thumb")
          .eq("modelo", modelo)
          .order("ordem", { ascending: true });
        if (!eVs && vs) {
          return jsonCache(
            (vs as { secao: string; ordem: number; figuras: number; thumb: string | null }[])
              .map((r) => ({ secao: r.secao || "Outros", ordem: r.ordem ?? 99, figuras: r.figuras, thumb: miniatura(r.thumb) }))
              .sort((a, b) => a.ordem - b.ordem)
          );
        }
      }
      // Filtra pela APLICAÇÃO (catalogo_figura_modelos) via inner join: uma figura
      // de fábrica pode servir vários modelos, então o vínculo não vive mais na
      // coluna catalogo_figuras.modelo.
      let qs = supabase
        .from("catalogo_figuras")
        .select(modelo
          ? "secao, secao_ordem, ordem, thumb_url, image_url, catalogo_figura_modelos!inner(modelo)"
          : "secao, secao_ordem, ordem, thumb_url, image_url")
        .order("secao_ordem", { ascending: true })
        .order("ordem", { ascending: true });
      if (modelo) qs = qs.eq("catalogo_figura_modelos.modelo", modelo);
      const { data, error } = await qs;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const map = new Map<string, { secao: string; ordem: number; figuras: number; thumb: string | null }>();
      for (const f of ((data || []) as any[])) {
        const s = f.secao || "Outros";
        if (!map.has(s)) map.set(s, { secao: s, ordem: f.secao_ordem ?? 99, figuras: 0, thumb: null });
        const o = map.get(s)!;
        o.figuras++;
        if (!o.thumb) o.thumb = f.image_url || f.thumb_url || null; // imagem da 1ª figura da seção
      }
      return jsonCache([...map.values()].sort((a, b) => a.ordem - b.ordem));
    }

    // Figuras (de uma seção, ou todas)
    if (acao === "figuras") {
      const secao = req.nextUrl.searchParams.get("secao");
      let q = supabase
        .from("catalogo_figuras")
        .select(modelo
          ? "id, code, name, secao, thumb_url, image_url, ordem, catalogo_figura_modelos!inner(modelo)"
          : "id, code, name, secao, thumb_url, image_url, ordem")
        .order("ordem", { ascending: true });
      if (secao) q = q.eq("secao", secao);
      if (modelo) q = q.eq("catalogo_figura_modelos.modelo", modelo);
      const { data, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      // Tira o campo do join (só serviu de filtro) e serve a miniatura leve:
      // a grade usa thumb_url, então é aqui que o peso da tela é decidido.
      const limpas = ((data || []) as any[]).map((f: any) => {
        const { catalogo_figura_modelos: _ap, ...resto } = f;
        return { ...resto, thumb_url: miniatura(resto.thumb_url || resto.image_url) };
      });
      return jsonCache(limpas);
    }

    // Busca por nome ou código (peças) + a figura de cada uma
    if (acao === "busca") {
      const raw = (req.nextUrl.searchParams.get("q") || "").trim();
      const q = limpo(raw);
      if (q.length < 2) return NextResponse.json([]);
      const SEL = "id, code, name, reference, qtd, unit, figura_id";

      // Detecta o trator citado na busca (ex.: "filtro de ar 6075") pra filtrar por modelo
      let modeloDet: string | null = modelo;
      if (!modeloDet) {
        const { data: mods } = await supabase.from("catalogo_modelos").select("nome");
        const nomes = (mods || []).map((m) => m.nome).filter(Boolean) as string[];
        const low = " " + q.toLowerCase() + " ";
        modeloDet = nomes.find((n) => low.includes(" " + n.toLowerCase() + " ")) || null;
        if (!modeloDet) modeloDet = nomes.find((n) => (n.match(/\d{3,}/g) || []).some((d) => low.includes(d))) || null;
      }

      // Quebra em palavras; tira conectores e o que for do modelo (nome/dígitos)
      const STOP = new Set(["de", "da", "do", "dos", "das", "com", "para", "pra", "no", "na", "em", "e", "ou", "a", "o"]);
      const modLow = (modeloDet || "").toLowerCase();
      const modDigs = new Set((modeloDet || "").match(/\d{3,}/g) || []);
      const tokens = q.toLowerCase().split(/\s+/).filter((t) => t.length >= 2 && !STOP.has(t) && !modDigs.has(t) && !(modLow && modLow.includes(t)));

      // Busca: AND (todas as palavras) -> se vazio, OR (qualquer) + código
      const rodar = async (and: boolean) => {
        // Filtra pela APLICAÇÃO da figura (peça -> figura -> modelos), não por
        // catalogo_pecas.modelo: numa figura compartilhada a peça existe uma vez
        // só e o modelo vem da figura.
        let pq = supabase
          .from("catalogo_pecas")
          .select(modeloDet ? `${SEL}, catalogo_figuras!inner(catalogo_figura_modelos!inner(modelo))` : SEL)
          .limit(60);
        if (modeloDet) pq = pq.eq("catalogo_figuras.catalogo_figura_modelos.modelo", modeloDet);
        if (tokens.length === 0) pq = pq.or(`name.ilike.%${sanitizarFiltro(q)}%,code.ilike.%${sanitizarFiltro(q)}%`);
        else if (and) { for (const t of tokens) pq = pq.ilike("name", `%${t}%`); }
        else pq = pq.or([...tokens.map((t) => `name.ilike.%${sanitizarFiltro(t)}%`), `code.ilike.%${sanitizarFiltro(q)}%`].join(","));
        return ((await pq).data || []) as any[];
      };
      let pecas = await rodar(true);
      if (!pecas || pecas.length === 0) pecas = await rodar(false);
      const error = null as any;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const figIds = [...new Set((pecas || []).map((p) => p.figura_id))];
      let figMap: Record<string, any> = {};
      // Em quais MODELOS a peça é usada: uma figura de fábrica serve vários
      // modelos, então a mesma peça costuma valer pra mais de uma máquina.
      const modelosPorFigura: Record<string, string[]> = {};
      if (figIds.length) {
        const [{ data: figs }, { data: apps }] = await Promise.all([
          supabase.from("catalogo_figuras").select("id, code, name, secao, thumb_url").in("id", figIds),
          supabase.from("catalogo_figura_modelos").select("figura_id, modelo").in("figura_id", figIds),
        ]);
        figMap = Object.fromEntries((figs || []).map((f) => [f.id, f]));
        for (const a of apps || []) {
          const k = String(a.figura_id);
          if (!modelosPorFigura[k]) modelosPorFigura[k] = [];
          if (a.modelo && !modelosPorFigura[k].includes(a.modelo)) modelosPorFigura[k].push(a.modelo);
        }
        for (const k of Object.keys(modelosPorFigura)) modelosPorFigura[k].sort((a, b) => a.localeCompare(b, "pt-BR"));
      }
      // Ranking: código que começa com a busca > nome que começa com a 1ª palavra > nome que contém
      const ql = q.toLowerCase();
      const principal = tokens[0] || ql;
      const rel = (p: any) => {
        const code = (p.code || "").toLowerCase(), name = (p.name || "").toLowerCase();
        if (code.startsWith(ql)) return 0;
        if (name.startsWith(principal)) return 1;
        if (name.includes(principal)) return 2;
        return 3;
      };
      const result = (pecas || [])
        .map((p: any) => {
          // tira o campo do join (só serviu de filtro)
          const { catalogo_figuras: _ap, ...resto } = p;
          const fig = figMap[p.figura_id] || null;
          return {
            ...resto,
            figura: fig ? { ...fig, thumb_url: miniatura(fig.thumb_url) } : null,
            modelos: modelosPorFigura[String(p.figura_id)] || [],
          };
        })
        .sort((a, b) => rel(a) - rel(b));
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
