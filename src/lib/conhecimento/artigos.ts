// BASE DE CONHECIMENTO — regras do artigo. PURO (sem I/O), client-safe.
//
// Modelo: as colunas do artigo guardam o conteúdo VIGENTE (o que o leitor vê).
// Editar um artigo já publicado grava em `rascunho` e o leitor só vê a mudança
// quando o responsável publica. Artigo que nunca foi publicado (status
// 'rascunho', versão 0) guarda o próprio rascunho nas colunas.

import { sanitizarCorpo, slugify, type Bloco } from "./blocos";

export type StatusArtigo = "rascunho" | "publicado" | "arquivado";
export type TipoArtigo = "tela" | "procedimento" | "regra" | "faq" | "produto";
export type OrigemArtigo = "manual" | "ia" | "seed" | "entrega";

export const TIPOS_ARTIGO: { valor: TipoArtigo; rotulo: string }[] = [
  { valor: "tela", rotulo: "Como usar a tela" },
  { valor: "procedimento", rotulo: "Procedimento" },
  { valor: "regra", rotulo: "Regra do sistema" },
  { valor: "faq", rotulo: "Pergunta frequente" },
  { valor: "produto", rotulo: "Produto / técnico" },
];

/** O que pode ser editado e versionado. */
export interface Conteudo {
  titulo: string;
  resumo: string | null;
  corpo: Bloco[];
  tipo: TipoArtigo;
  telas: string[];
  tags: string[];
  ordem: number;
}

export interface Artigo extends Conteudo {
  id: string;
  slug: string;
  modulo: string;
  fontes: string[];
  publico: string[];
  status: StatusArtigo;
  versao: number;
  rascunho: Conteudo | null;
  rascunho_por: string | null;
  rascunho_em: string | null;
  origem: OrigemArtigo;
  revisao_pendente_desde: string | null;
  revisao_motivo: unknown;
  revisar_ate: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  publicado_por_nome: string | null;
  publicado_em: string | null;
  atualizado_em: string;
}

/** Linha de lista: sem o corpo. */
export type ArtigoResumo = Omit<Artigo, "corpo" | "rascunho"> & { tem_rascunho: boolean };

export interface Quem {
  userId: string;
  isAdmin: boolean;
  modulos: string[];
  categoria: string | null;
}

export const MODULO_GERAL = "geral";
export const MODULO_KMS = "conhecimento";

// -----------------------------------------------------------------------------
// Tela ↔ artigo
// -----------------------------------------------------------------------------
/** "/pos/?x=1#y" → "/pos". Sempre começa com "/" e nunca termina com "/" (exceto a raiz). */
export function normalizarTela(p: string | null | undefined): string {
  let s = (p || "").trim().split("?")[0].split("#")[0];
  if (!s) return "";
  if (!s.startsWith("/")) s = "/" + s;
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s;
}

/**
 * Quanto a tela do artigo casa com o pathname: 0 = não casa; senão, o tamanho do
 * prefixo (maior = mais específico). "/pos" casa "/pos" e "/pos/123", não "/postos".
 */
export function forcaDoCasamento(tela: string, pathname: string): number {
  const t = normalizarTela(tela), p = normalizarTela(pathname);
  if (!t || !p) return 0;
  if (p === t) return t.length + 1; // exato vence prefixo de mesmo tamanho
  return p.startsWith(t === "/" ? "/" : t + "/") ? t.length : 0;
}

export function casaTela(telas: string[], pathname: string): boolean {
  return telas.some((t) => forcaDoCasamento(t, pathname) > 0);
}

/** Artigos da tela, do mais específico para o mais geral; depois `ordem` e título. */
export function artigosDaTela<T extends { telas: string[]; ordem: number; titulo: string }>(artigos: T[], pathname: string): T[] {
  return artigos
    .map((a) => ({ a, f: Math.max(0, ...a.telas.map((t) => forcaDoCasamento(t, pathname))) }))
    .filter((x) => x.f > 0)
    .sort((x, y) => y.f - x.f || x.a.ordem - y.a.ordem || x.a.titulo.localeCompare(y.a.titulo))
    .map((x) => x.a);
}

// -----------------------------------------------------------------------------
// Quem pode o quê
// -----------------------------------------------------------------------------
/** Espelho do temAcesso do portal: módulo puro, qualquer ação dele, ou admin. */
export function temModulo(q: Quem, modulo: string): boolean {
  if (q.isAdmin || modulo === MODULO_GERAL) return true;
  return q.modulos.some((m) => m === modulo || m.startsWith(modulo + ":"));
}

const temAcaoKms = (q: Quem, acao: string) => q.modulos.includes(MODULO_KMS) || q.modulos.includes(`${MODULO_KMS}:${acao}`);

/** modulo → user_id do responsável. */
export type Responsaveis = Record<string, string>;

export function ehResponsavel(q: Quem, modulo: string, resp: Responsaveis): boolean {
  return !!resp[modulo] && resp[modulo] === q.userId;
}
export function podeEditar(q: Quem, modulo: string, resp: Responsaveis): boolean {
  return q.isAdmin || temAcaoKms(q, "editar") || temAcaoKms(q, "publicar") || ehResponsavel(q, modulo, resp);
}
export function podePublicar(q: Quem, modulo: string, resp: Responsaveis): boolean {
  return q.isAdmin || temAcaoKms(q, "publicar") || ehResponsavel(q, modulo, resp);
}
/** Leitor: só publicado, do módulo a que tem acesso e (se houver) da sua categoria. */
export function podeLer(a: Pick<Artigo, "status" | "modulo" | "publico">, q: Quem): boolean {
  if (a.status !== "publicado") return false;
  if (!temModulo(q, a.modulo)) return false;
  if (q.isAdmin || a.publico.length === 0) return true;
  return !!q.categoria && a.publico.includes(q.categoria);
}

// -----------------------------------------------------------------------------
// Conteúdo
// -----------------------------------------------------------------------------
export function ehTipoArtigo(v: unknown): v is TipoArtigo {
  return TIPOS_ARTIGO.some((t) => t.valor === v);
}

const limpaLista = (v: unknown, max: number, tam: number): string[] =>
  Array.from(new Set((Array.isArray(v) ? v : []).map((x) => (typeof x === "string" ? x.trim().slice(0, tam) : "")).filter(Boolean))).slice(0, max);

/** Normaliza o que veio do editor/IA. `erros` vazio = pode salvar. */
export function validarConteudo(entrada: unknown): { conteudo: Conteudo; erros: string[] } {
  const e = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const titulo = typeof e.titulo === "string" ? e.titulo.trim().slice(0, 160) : "";
  const resumo = typeof e.resumo === "string" && e.resumo.trim() ? e.resumo.trim().slice(0, 500) : null;
  const corpo = sanitizarCorpo(e.corpo);
  const tipo: TipoArtigo = ehTipoArtigo(e.tipo) ? e.tipo : "tela";
  const telas = limpaLista(e.telas, 20, 200).map(normalizarTela).filter(Boolean);
  const tags = limpaLista(e.tags, 20, 40);
  const ordem = Number.isFinite(Number(e.ordem)) ? Math.max(0, Math.min(9999, Math.trunc(Number(e.ordem)))) : 0;
  const erros: string[] = [];
  if (titulo.length < 3) erros.push("Título com pelo menos 3 letras.");
  if (corpo.length === 0) erros.push("O artigo está sem conteúdo.");
  return { conteudo: { titulo, resumo, corpo, tipo, telas: Array.from(new Set(telas)), tags, ordem }, erros };
}

export function conteudoVigente(a: Artigo): Conteudo {
  return { titulo: a.titulo, resumo: a.resumo, corpo: a.corpo, tipo: a.tipo, telas: a.telas, tags: a.tags, ordem: a.ordem };
}
/** O que o editor abre: a edição pendente, se houver; senão o vigente. */
export function conteudoEmEdicao(a: Artigo): Conteudo {
  return a.rascunho ?? conteudoVigente(a);
}
/** Espera aprovação: nunca publicado, ou publicado com edição pendente. */
export function aguardaAprovacao(a: { status: StatusArtigo; rascunho?: unknown; tem_rascunho?: boolean }): boolean {
  return a.status === "rascunho" || !!a.rascunho || a.tem_rascunho === true;
}

export function slugDoArtigo(modulo: string, titulo: string): string {
  return slugify(`${modulo} ${titulo}`);
}

/** Validade vencida (data local YYYY-MM-DD). */
export function vencido(revisarAte: string | null | undefined, hoje: string): boolean {
  return !!revisarAte && revisarAte < hoje;
}

/** Hoje + N meses, em YYYY-MM-DD — validade padrão ao publicar. */
export function validadePadrao(hoje: Date = new Date(), meses = 6): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + meses, hoje.getDate());
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
