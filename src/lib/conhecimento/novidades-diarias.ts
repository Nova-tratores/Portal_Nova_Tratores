// NOVIDADES DO DIA (José, 22/10/2026): tudo o que mudou num módulo ontem vira UM
// aviso às 07:00, já publicado (sem aprovação), para quem tem acesso ao módulo —
// o que entrou, o que mudou, o que saiu e como ficou o fluxo. PURO (sem I/O);
// o servidor está em novidades-diarias-server.ts.
import { MODULOS_TELAS } from "@/lib/permissoes/telas";
import { moduloDoArquivo, modulosDoCommit, modulosDoEscopo, mudaATela, type CommitLido } from "./releases";

/** Começa a valer a partir de hoje: os rascunhos antigos ficam como estão. */
export const NOVIDADES_DIARIAS_DESDE = "2026-10-22T03:00:00.000Z"; // 22/10/2026 00:00 em Brasília

/** "geral" = telas que todo logado usa (agenda, sala, reuniões…): avisa todo mundo. */
export const MODULO_GERAL = "geral";

/** Módulos que podem receber aviso: os do Admin + Patrimônio + o geral. */
export const MODULOS_AVISO: ReadonlySet<string> = new Set([
  ...MODULOS_TELAS.map((m) => m.id).filter((id) => !id.includes(":")),
  "patrimonio", MODULO_GERAL,
]);

/** Tipos de commit que a pessoa percebe na tela (o resto é bastidor). */
const TIPOS_BASTIDOR = new Set(["docs", "test", "tests", "chore", "ci", "build", "style", "refactor"]);
export function mudancaVisivel(c: CommitLido): boolean {
  if (TIPOS_BASTIDOR.has(c.tipo)) return false;
  return !/^merge\b/i.test(c.titulo);
}

/** O escopo "opa" não diz qual aba: Ocorrências, Peças S/Estoque ou Patrimônio. */
const SUBMODULOS: Record<string, string[]> = { opa: ["opa", "opa-pecas", "patrimonio"] };

/** Módulos de um commit: os do ESCOPO do título ("feat(pos/ppv): …") — o arquivo
 *  compartilhado não arrasta o aviso para módulos que não mudaram de verdade. Escopo
 *  ambíguo (opa) ou ausente: decide pelos arquivos da tela. */
export function modulosDaMudanca(c: CommitLido): string[] {
  const dosArquivos = Array.from(new Set(c.arquivos.filter(mudaATela).map(moduloDoArquivo)
    .filter((m): m is string => !!m && MODULOS_AVISO.has(m))));
  const doEscopo = modulosDoEscopo(c.escopo, MODULOS_AVISO);
  if (!doEscopo.length) return dosArquivos.length ? dosArquivos : modulosDoCommit(c, MODULOS_AVISO);
  return Array.from(new Set(doEscopo.flatMap((m) => {
    const subs = SUBMODULOS[m];
    if (!subs) return [m];
    const achados = dosArquivos.filter((a) => subs.includes(a));
    return achados.length ? achados : [m];
  })));
}

/** módulo → commits do período (sem repetir o mesmo commit). */
export function agruparPorModulo(commits: CommitLido[]): Map<string, CommitLido[]> {
  const out = new Map<string, CommitLido[]>();
  const vistos = new Set<string>();
  for (const c of commits) {
    if (vistos.has(c.sha) || !mudancaVisivel(c)) continue;
    vistos.add(c.sha);
    for (const m of modulosDaMudanca(c)) (out.get(m) ?? out.set(m, []).get(m)!).push(c);
  }
  return out;
}

/** 00:00 de hoje em Brasília, em ISO (o dia anterior termina aqui). */
export function inicioDoDiaBR(agora: Date = new Date()): string {
  const dia = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(`${dia}T00:00:00-03:00`).toISOString();
}

export interface UsuarioAcesso { user_id: string; is_admin?: boolean | null; is_dev?: boolean | null; modulos: string[] }

/** Quem tem acesso ao módulo (admin/dev veem tudo; geral = todos). */
export function temAcessoModulo(u: UsuarioAcesso, modulo: string): boolean {
  if (modulo === MODULO_GERAL || u.is_admin || u.is_dev) return true;
  return u.modulos.some((m) => m === modulo || m.startsWith(modulo + ":"));
}

export const SISTEMA_NOVIDADE_DIA = `Você escreve o aviso diário "O que mudou" do portal interno da Nova Tratores (concessionária de tratores), em português do Brasil, para os funcionários que usam UM módulo do portal.
Recebe os commits do dia anterior desse módulo (título e, quando houver, a descrição com os detalhes).

O QUE ESCREVER
- "novo": o que passou a existir (tela, botão, opção, campo, aviso).
- "mudou": o que já existia e agora funciona diferente, inclusive correções ("antes X, agora Y").
- "saiu": o que foi retirado ou deixou de aparecer.
- "como_fica": quando um FLUXO mudou (ordem dos passos, quem aprova, onde clicar), descreva o passo a passo de como ficou agora, em frases curtas. Se nenhum fluxo mudou, deixe vazio.

REGRAS
- Só o que a pessoa percebe na tela. Ignore código, arquivos, tabelas, rotas, testes, nomes de função.
- Não invente: use só o que está nos commits. Na dúvida, descreva de forma simples o que o commit diz.
- Frases curtas, linguagem de quem usa a tela, sem jargão, sem inglês, sem emojis. Nada de negrito.
- Uma mudança por item. Junte itens repetidos.
- Cada item é uma frase completa, começando com letra maiúscula, dizendo ONDE na tela e O QUE a pessoa faz ou vê agora (ex.: "Na ficha do carro, o checklist do mês aparece em destaque no topo, com as fotos e as pendências.").
- O título diz o principal do dia em linguagem simples (ex.: "Checklist do carro em destaque e fotos em tela cheia"), nunca "Novas funcionalidades" ou "Atualizações".
- Ignore o que só vale para outro módulo, mesmo que apareça no mesmo commit.

Responda só com JSON: {"titulo": "até 70 caracteres resumindo o dia neste módulo", "novo": [], "mudou": [], "saiu": [], "como_fica": []}`;

export function entradaIA(rotulo: string, commits: CommitLido[]): string {
  const linhas = commits.map((c) => {
    const corpo = (c.corpo || "").replace(/Co-Authored-By:.*$/gim, "").trim();
    return `- ${c.titulo}${corpo ? `\n  ${corpo.replace(/\n/g, "\n  ").slice(0, 1500)}` : ""}`;
  });
  return `Módulo: ${rotulo}\nCommits de ontem:\n${linhas.join("\n")}`.slice(0, 12000);
}

const SECOES: { chave: "novo" | "mudou" | "saiu" | "como_fica"; titulo: string; ordenada?: boolean }[] = [
  { chave: "novo", titulo: "O que tem de novo" },
  { chave: "mudou", titulo: "O que mudou" },
  { chave: "saiu", titulo: "O que saiu" },
  { chave: "como_fica", titulo: "Como fica agora", ordenada: true },
];

const listaTexto = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).map((i) => (typeof i === "string" ? i.replace(/\*\*/g, "").trim() : "")).filter(Boolean).slice(0, 15);

/** JSON da IA → título + texto em markdown simples (## seção + lista). null = resposta inútil. */
export function textoDaIA(j: unknown): { titulo: string; texto: string } | null {
  const o = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  const titulo = typeof o.titulo === "string" ? o.titulo.trim().slice(0, 120) : "";
  const partes: string[] = [];
  for (const s of SECOES) {
    const itens = listaTexto(o[s.chave]);
    if (!itens.length) continue;
    partes.push(`## ${s.titulo}`, ...itens.map((i, n) => (s.ordenada ? `${n + 1}. ${i}` : `- ${i}`)), "");
  }
  if (!titulo || !partes.length) return null;
  return { titulo, texto: partes.join("\n").trim() };
}

/** Reserva sem IA: uma linha por commit, sem o prefixo técnico. */
export function textoSemIA(rotulo: string, commits: CommitLido[]): { titulo: string; texto: string } {
  const novo = commits.filter((c) => c.tipo === "feat");
  const mudou = commits.filter((c) => c.tipo !== "feat");
  const linha = (c: CommitLido) => `- ${c.descricao.charAt(0).toUpperCase()}${c.descricao.slice(1)}`;
  const partes = [
    ...(novo.length ? ["## O que tem de novo", ...novo.map(linha), ""] : []),
    ...(mudou.length ? ["## O que mudou", ...mudou.map(linha), ""] : []),
  ];
  return { titulo: `Mudanças em ${rotulo}`, texto: partes.join("\n").trim() };
}
