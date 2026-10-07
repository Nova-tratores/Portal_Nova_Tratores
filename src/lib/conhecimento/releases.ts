// BASE DE CONHECIMENTO — o que uma versão nova do sistema afeta. PURO (sem I/O).
//
// Entrada: os commits de um push (título no padrão `tipo(escopo): descrição`, já
// seguido em ~95 % dos commits do portal) e os arquivos que cada um alterou.
// Saída: quais módulos foram tocados, quais artigos podem ter ficado velhos
// (pelas `fontes` do artigo) e quais commits viram "novidade" para o usuário.

export interface CommitBruto {
  sha: string;
  titulo: string;
  autor?: string | null;
  data?: string | null;
  arquivos?: string[];
}

export interface CommitLido extends CommitBruto {
  tipo: string;        // feat, fix, docs… ("" se fora do padrão)
  escopo: string;      // "pos/ppv", "feedbacks/relatorios"… ("" se não houver)
  descricao: string;   // o que vem depois de ": "
  arquivos: string[];
}

const RE_COMMIT = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

export function lerCommit(c: CommitBruto): CommitLido {
  const titulo = (c.titulo || "").trim();
  const m = titulo.match(RE_COMMIT);
  return {
    ...c,
    titulo,
    tipo: m ? m[1].toLowerCase() : "",
    escopo: m?.[2]?.trim().toLowerCase() ?? "",
    descricao: m ? m[4].trim() : titulo,
    arquivos: Array.isArray(c.arquivos) ? c.arquivos.filter((a) => typeof a === "string" && a) : [],
  };
}

/** Nomes que aparecem no escopo dos commits mas não são o id do módulo. */
const ALIAS_ESCOPO: Record<string, string> = {
  pecas: "ppv", "peças": "ppv",
  "pos-vendas": "pos", "pós-vendas": "pos", os: "pos",
  garantia: "garantias", revisao: "revisoes", "revisão": "revisoes",
  feedback: "feedbacks", crm: "feedbacks",
  requisicao: "requisicoes", ticket: "tickets",
};
const alias = (s: string) => ALIAS_ESCOPO[s] ?? s;

/** "pos/ppv" → ["pos","ppv"]; "feedbacks/relatorios" → ["feedbacks"] (só o que é módulo conhecido). */
export function modulosDoEscopo(escopo: string, conhecidos: ReadonlySet<string>): string[] {
  const partes = (escopo || "").split(/[\/,+&]/).map((p) => alias(p.trim().toLowerCase())).filter(Boolean);
  return Array.from(new Set(partes.filter((p) => conhecidos.has(p))));
}

const RE_MODULO_NO_CAMINHO = /^src\/(?:app\/\(portal\)\/(?:\([^)]+\)\/)?|app\/api\/|components\/|lib\/)([^/]+)\//;

/** `src/lib/pos/x.ts` → "pos"; `src/app/(portal)/(servicos)/pos/page.tsx` → "pos". */
export function moduloDoArquivo(arquivo: string): string | null {
  const m = (arquivo || "").replace(/\\/g, "/").match(RE_MODULO_NO_CAMINHO);
  return m ? alias(m[1].toLowerCase()) : null;
}

/** Arquivo que pode mudar o que o usuário vê: fora testes, documentação, SQL, scripts e CI. */
export function mudaATela(arquivo: string): boolean {
  const a = (arquivo || "").replace(/\\/g, "/");
  if (!a.startsWith("src/")) return false;
  if (a.includes("/__tests__/") || /\.(test|spec)\.[tj]sx?$/.test(a)) return false;
  return !a.endsWith(".md");
}

export function modulosDoCommit(c: CommitLido, conhecidos: ReadonlySet<string>): string[] {
  const doEscopo = modulosDoEscopo(c.escopo, conhecidos);
  const dosArquivos = c.arquivos.filter(mudaATela).map(moduloDoArquivo).filter((m): m is string => !!m && conhecidos.has(m));
  return Array.from(new Set([...doEscopo, ...dosArquivos]));
}

// -----------------------------------------------------------------------------
// fontes (globs) × arquivos
// -----------------------------------------------------------------------------
/** Glob simples: `**` = qualquer coisa (inclusive /), `*` = qualquer coisa menos /. O resto é literal. */
export function globParaRegex(glob: string): RegExp {
  const g = glob.replace(/\\/g, "/").trim();
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === "*") {
      if (g[i + 1] === "*") { re += ".*"; i++; if (g[i + 1] === "/") i++; }
      else re += "[^/]*";
    } else re += /[.+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
  }
  return new RegExp(`^${re}$`);
}

export function casaGlob(glob: string, arquivo: string): boolean {
  return !!glob && globParaRegex(glob).test((arquivo || "").replace(/\\/g, "/"));
}

export interface ArtigoVigiado { id: string; modulo: string; fontes: string[]; titulo?: string }
export interface Afetado { id: string; modulo: string; arquivos: string[] }

/** Artigos cujas fontes casam com algum arquivo alterado que muda a tela. */
export function artigosAfetados(artigos: ArtigoVigiado[], arquivos: string[]): Afetado[] {
  const relevantes = Array.from(new Set(arquivos.filter(mudaATela)));
  const out: Afetado[] = [];
  for (const a of artigos) {
    if (!a.fontes?.length) continue;
    const regs = a.fontes.map(globParaRegex);
    const casou = relevantes.filter((f) => regs.some((r) => r.test(f)));
    if (casou.length) out.push({ id: a.id, modulo: a.modulo, arquivos: casou });
  }
  return out;
}

// -----------------------------------------------------------------------------
// novidades
// -----------------------------------------------------------------------------
/** Commit que o usuário percebe: função nova, correção ou ganho de velocidade. */
export function ehNovidade(c: CommitLido): boolean {
  return c.tipo === "feat" || c.tipo === "fix" || c.tipo === "perf";
}

/** módulo → commits que viram novidade, só para os módulos conhecidos (com responsável). */
export function novidadesPorModulo(commits: CommitLido[], conhecidos: ReadonlySet<string>): Map<string, CommitLido[]> {
  const out = new Map<string, CommitLido[]>();
  for (const c of commits) {
    if (!ehNovidade(c)) continue;
    for (const m of modulosDoCommit(c, conhecidos)) (out.get(m) ?? out.set(m, []).get(m)!).push(c);
  }
  return out;
}

/** Texto de reserva quando a IA falha: uma linha por commit, sem o prefixo técnico. */
export function novidadeSemIA(commits: CommitLido[]): string {
  return commits.map((c) => `- ${c.tipo === "fix" ? "Correção: " : ""}${c.descricao.charAt(0).toUpperCase()}${c.descricao.slice(1)}`).join("\n");
}

export interface MotivoRevisao {
  release: string;                         // sha da versão mais recente que tocou
  commits: { sha: string; titulo: string }[];
  arquivos: string[];
}

/** Junta o motivo novo ao que já estava pendente (sem repetir commit, teto de 20/20). */
export function juntarMotivo(anterior: unknown, novo: MotivoRevisao): MotivoRevisao {
  const a = (anterior && typeof anterior === "object" ? anterior : {}) as Partial<MotivoRevisao>;
  const commits = [...(Array.isArray(a.commits) ? a.commits : []), ...novo.commits];
  const vistos = new Set<string>();
  return {
    release: novo.release,
    commits: commits.filter((c) => c?.sha && !vistos.has(c.sha) && vistos.add(c.sha)).slice(-20),
    arquivos: Array.from(new Set([...(Array.isArray(a.arquivos) ? a.arquivos : []), ...novo.arquivos])).slice(0, 20),
  };
}

/** Valida o corpo do POST do workflow. Devolve null se não der para usar. */
export function lerPayloadRelease(body: unknown): { sha: string; sha_anterior: string | null; commits: CommitLido[]; arquivos: string[] } | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const sha = typeof b.sha === "string" ? b.sha.trim() : "";
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) return null;
  const commits = (Array.isArray(b.commits) ? b.commits : []).slice(0, 300)
    .filter((c): c is CommitBruto => !!c && typeof c === "object" && typeof (c as CommitBruto).sha === "string" && typeof (c as CommitBruto).titulo === "string")
    .map(lerCommit);
  const soltos = (Array.isArray(b.arquivos) ? b.arquivos : []).filter((a): a is string => typeof a === "string");
  const arquivos = Array.from(new Set([...soltos, ...commits.flatMap((c) => c.arquivos)])).slice(0, 5000);
  return { sha, sha_anterior: typeof b.sha_anterior === "string" && b.sha_anterior ? b.sha_anterior : null, commits, arquivos };
}
