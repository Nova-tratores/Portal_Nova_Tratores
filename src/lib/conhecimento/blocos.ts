// BASE DE CONHECIMENTO — conteúdo em blocos tipados. PURO (sem I/O), client-safe.
//
// O artigo não é markdown nem HTML: é uma lista de blocos que a tela desenha
// (components/conhecimento/Artigo.tsx). Vantagens: não precisa de renderizador de
// markdown, não há HTML para sanitizar e o treinamento/IA conseguem ler a
// estrutura. O texto dentro do bloco aceita só dois enfeites: **negrito** e `código`.

export type ItemLista = { texto: string; sub?: string[] };

export type Bloco =
  | { tipo: "p"; texto: string }
  | { tipo: "titulo"; texto: string }
  | { tipo: "lista"; itens: ItemLista[]; ordenada?: boolean }
  | { tipo: "passos"; itens: { titulo: string; texto?: string; dica?: string }[] }
  | { tipo: "tabela"; colunas: string[]; linhas: string[][] }
  | { tipo: "aviso"; texto: string; tom?: "info" | "atencao" | "perigo" }
  | { tipo: "termos"; itens: { termo: string; definicao: string }[] }
  | { tipo: "imagem"; url: string; legenda?: string }
  | { tipo: "video"; url: string; legenda?: string }
  | { tipo: "codigo"; texto: string };

export type TipoBloco = Bloco["tipo"];

export const TIPOS_BLOCO: { tipo: TipoBloco; rotulo: string }[] = [
  { tipo: "p", rotulo: "Parágrafo" },
  { tipo: "titulo", rotulo: "Subtítulo" },
  { tipo: "lista", rotulo: "Lista" },
  { tipo: "passos", rotulo: "Passo a passo" },
  { tipo: "tabela", rotulo: "Tabela" },
  { tipo: "aviso", rotulo: "Aviso" },
  { tipo: "termos", rotulo: "Termos" },
  { tipo: "imagem", rotulo: "Imagem" },
  { tipo: "video", rotulo: "Vídeo" },
  { tipo: "codigo", rotulo: "Código / texto fixo" },
];

export const LIMITES = { blocos: 200, texto: 6000, itens: 100, colunas: 12, linhas: 200 };

const str = (v: unknown, max = LIMITES.texto): string => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Só http(s) ou caminho do próprio portal — nunca `javascript:` nem `data:`. */
export function urlSegura(v: unknown): string {
  const s = str(v, 2000);
  return /^https?:\/\//i.test(s) || s.startsWith("/") ? s : "";
}

export function blocoVazio(tipo: TipoBloco): Bloco {
  switch (tipo) {
    case "p": return { tipo, texto: "" };
    case "titulo": return { tipo, texto: "" };
    case "lista": return { tipo, itens: [{ texto: "" }] };
    case "passos": return { tipo, itens: [{ titulo: "" }] };
    case "tabela": return { tipo, colunas: ["", ""], linhas: [["", ""]] };
    case "aviso": return { tipo, texto: "", tom: "info" };
    case "termos": return { tipo, itens: [{ termo: "", definicao: "" }] };
    case "imagem": return { tipo, url: "" };
    case "video": return { tipo, url: "" };
    case "codigo": return { tipo, texto: "" };
  }
}

/**
 * Aceita qualquer coisa (corpo vindo do navegador, da IA ou do seed) e devolve só
 * blocos válidos, com limites. Bloco que ficou vazio é descartado.
 */
export function sanitizarCorpo(entrada: unknown): Bloco[] {
  const out: Bloco[] = [];
  for (const bruto of arr(entrada).slice(0, LIMITES.blocos)) {
    if (!bruto || typeof bruto !== "object") continue;
    const b = bruto as Record<string, unknown>;
    switch (b.tipo) {
      case "p":
      case "titulo":
      case "codigo": {
        const texto = str(b.texto);
        if (texto) out.push({ tipo: b.tipo, texto });
        break;
      }
      case "aviso": {
        const texto = str(b.texto);
        const tom = b.tom === "atencao" || b.tom === "perigo" ? b.tom : "info";
        if (texto) out.push({ tipo: "aviso", texto, tom });
        break;
      }
      case "lista": {
        const itens: ItemLista[] = [];
        for (const it of arr(b.itens).slice(0, LIMITES.itens)) {
          const texto = typeof it === "string" ? str(it) : str((it as { texto?: unknown })?.texto);
          if (!texto) continue;
          const sub = typeof it === "object" && it ? arr((it as { sub?: unknown }).sub).map((s) => str(s)).filter(Boolean).slice(0, LIMITES.itens) : [];
          itens.push(sub.length ? { texto, sub } : { texto });
        }
        if (itens.length) out.push(b.ordenada === true ? { tipo: "lista", itens, ordenada: true } : { tipo: "lista", itens });
        break;
      }
      case "passos": {
        const itens = arr(b.itens).slice(0, LIMITES.itens).map((it) => {
          const o = (it || {}) as Record<string, unknown>;
          const titulo = str(o.titulo, 300), texto = str(o.texto), dica = str(o.dica, 1000);
          return { titulo, ...(texto ? { texto } : {}), ...(dica ? { dica } : {}) };
        }).filter((i) => i.titulo);
        if (itens.length) out.push({ tipo: "passos", itens });
        break;
      }
      case "tabela": {
        const colunas = arr(b.colunas).slice(0, LIMITES.colunas).map((c) => str(c, 200));
        const n = colunas.length;
        const linhas = arr(b.linhas).slice(0, LIMITES.linhas)
          .map((l) => Array.from({ length: n }, (_, i) => str(arr(l)[i], 2000)))
          .filter((l) => l.some(Boolean));
        if (n > 0 && colunas.some(Boolean) && linhas.length) out.push({ tipo: "tabela", colunas, linhas });
        break;
      }
      case "termos": {
        const itens = arr(b.itens).slice(0, LIMITES.itens).map((it) => {
          const o = (it || {}) as Record<string, unknown>;
          return { termo: str(o.termo, 200), definicao: str(o.definicao, 2000) };
        }).filter((i) => i.termo && i.definicao);
        if (itens.length) out.push({ tipo: "termos", itens });
        break;
      }
      case "imagem":
      case "video": {
        const url = urlSegura(b.url);
        const legenda = str(b.legenda, 300);
        if (url) out.push({ tipo: b.tipo, url, ...(legenda ? { legenda } : {}) });
        break;
      }
    }
  }
  return out;
}

/** Todo o texto do corpo numa linha só — para a busca e para a prévia. */
export function textoPlano(corpo: Bloco[]): string {
  const partes: string[] = [];
  for (const b of corpo) {
    switch (b.tipo) {
      case "p": case "titulo": case "aviso": case "codigo": partes.push(b.texto); break;
      case "lista": for (const i of b.itens) { partes.push(i.texto); if (i.sub) partes.push(...i.sub); } break;
      case "passos": for (const i of b.itens) partes.push(i.titulo, i.texto ?? "", i.dica ?? ""); break;
      case "tabela": partes.push(...b.colunas); for (const l of b.linhas) partes.push(...l); break;
      case "termos": for (const i of b.itens) partes.push(i.termo, i.definicao); break;
      case "imagem": case "video": if (b.legenda) partes.push(b.legenda); break;
    }
  }
  return partes.join(" ").replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
}

/** minúsculo, sem acento, só letras/números/espaço — o que vai para `texto_busca`. */
export function normalizarBusca(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function textoDeBusca(titulo: string, resumo: string | null | undefined, corpo: Bloco[], tags: string[] = []): string {
  return normalizarBusca([titulo, resumo ?? "", tags.join(" "), textoPlano(corpo)].join(" ")).slice(0, 60000);
}

/** "orç env" → "orc:* & env:*" (to_tsquery, config simple). Vazio = sem busca. */
export function consultaTs(q: string): string {
  return normalizarBusca(q).split(" ").filter((t) => t.length >= 2).slice(0, 8).map((t) => `${t}:*`).join(" & ");
}

export function slugify(s: string): string {
  return normalizarBusca(s).replace(/ /g, "-").slice(0, 80) || "artigo";
}

// -----------------------------------------------------------------------------
// Texto com enfeites mínimos: **negrito** e `código`
// -----------------------------------------------------------------------------
export type Trecho = { t: "txt" | "b" | "code"; v: string };

export function trechos(texto: string): Trecho[] {
  const out: Trecho[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let ultimo = 0, m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) out.push({ t: "txt", v: texto.slice(ultimo, m.index) });
    out.push(m[1] !== undefined ? { t: "b", v: m[1] } : { t: "code", v: m[2] });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) out.push({ t: "txt", v: texto.slice(ultimo) });
  return out;
}

// -----------------------------------------------------------------------------
// Markdown simples → blocos (seed dos docs existentes e "colar texto" no editor)
// Entende: # títulos, listas "- " e "1. " (com um nível de sub-item), tabelas
// com |, citação "> " (vira aviso), bloco ``` e parágrafos.
// -----------------------------------------------------------------------------
export function mdParaBlocos(md: string): Bloco[] {
  const linhas = (md || "").replace(/\r\n/g, "\n").split("\n");
  const out: Bloco[] = [];
  let paragrafo: string[] = [];
  let lista: { ordenada: boolean; itens: ItemLista[] } | null = null;
  let tabela: string[][] | null = null;
  let citacao: string[] = [];
  let codigo: string[] | null = null;

  const fechaP = () => { if (paragrafo.length) { out.push({ tipo: "p", texto: paragrafo.join(" ").trim() }); paragrafo = []; } };
  const fechaL = () => { if (lista) { out.push(lista.ordenada ? { tipo: "lista", itens: lista.itens, ordenada: true } : { tipo: "lista", itens: lista.itens }); lista = null; } };
  const fechaT = () => {
    if (tabela && tabela.length >= 2) out.push({ tipo: "tabela", colunas: tabela[0], linhas: tabela.slice(1) });
    else if (tabela) for (const l of tabela) out.push({ tipo: "p", texto: l.join(" · ") });
    tabela = null;
  };
  const fechaC = () => { if (citacao.length) { out.push({ tipo: "aviso", texto: citacao.join(" ").trim(), tom: "info" }); citacao = []; } };
  const fechaTudo = () => { fechaP(); fechaL(); fechaT(); fechaC(); };
  const celulas = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

  for (const bruta of linhas) {
    if (codigo) {
      if (/^\s*```/.test(bruta)) { out.push({ tipo: "codigo", texto: codigo.join("\n") }); codigo = null; }
      else codigo.push(bruta);
      continue;
    }
    if (/^\s*```/.test(bruta)) { fechaTudo(); codigo = []; continue; }

    const l = bruta.replace(/\s+$/, "");
    if (!l.trim()) { fechaTudo(); continue; }

    const titulo = l.match(/^#{1,6}\s+(.*)$/);
    if (titulo) { fechaTudo(); out.push({ tipo: "titulo", texto: titulo[1].trim() }); continue; }

    if (/^\s*\|.*\|\s*$/.test(l)) {
      fechaP(); fechaL(); fechaC();
      if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue; // linha separadora |---|---|
      (tabela ??= []).push(celulas(l));
      continue;
    }
    fechaT();

    if (/^\s*>\s?/.test(l)) { fechaP(); fechaL(); citacao.push(l.replace(/^\s*>\s?/, "")); continue; }
    fechaC();

    const item = l.match(/^(\s*)(?:[-*]|(\d+)[.)])\s+(.*)$/);
    if (item) {
      fechaP();
      const recuo = item[1].length, ordenada = item[2] !== undefined, texto = item[3].trim();
      if (recuo >= 2 && lista && lista.itens.length) {
        const pai = lista.itens[lista.itens.length - 1];
        (pai.sub ??= []).push(texto);
      } else {
        if (lista && lista.ordenada !== ordenada) fechaL();
        (lista ??= { ordenada, itens: [] }).itens.push({ texto });
      }
      continue;
    }

    // linha de continuação de um item de lista (recuada) → junta no item
    if (lista && /^\s{2,}\S/.test(bruta)) {
      const ultimo = lista.itens[lista.itens.length - 1];
      if (ultimo.sub?.length) ultimo.sub[ultimo.sub.length - 1] += " " + l.trim();
      else ultimo.texto += " " + l.trim();
      continue;
    }
    fechaL();
    paragrafo.push(l.trim());
  }
  if (codigo) out.push({ tipo: "codigo", texto: codigo.join("\n") });
  fechaTudo();
  return sanitizarCorpo(out);
}
