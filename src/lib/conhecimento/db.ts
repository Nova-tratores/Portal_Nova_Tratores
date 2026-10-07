/* eslint-disable @typescript-eslint/no-explicit-any */
// BASE DE CONHECIMENTO — acesso ao banco (SERVIDOR, service role).
// As tabelas kb_* têm RLS ligado sem policy: só este arquivo fala com elas.
// Migration: sql/conhecimento-base.sql (o deploy não quebra sem ela — ver migrationFaltou).

import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import { filtrarDestinatarios } from "@/lib/notif/prefs";
import { consultaTs, textoDeBusca } from "./blocos";
import {
  conteudoVigente, slugDoArtigo, validadePadrao,
  type Artigo, type ArtigoResumo, type Conteudo, type OrigemArtigo, type Responsaveis,
} from "./artigos";

export const MSG_MIGRATION = "Base de conhecimento ainda não instalada por completo: rode sql/conhecimento-base.sql e sql/sistema-releases.sql no SQL Editor do Supabase.";

/** Tabela/coluna kb_* ausente = migration não aplicada (situação esperada no deploy). */
export function migrationFaltou(e: any): boolean {
  const code = String(e?.code || "");
  const msg = String(e?.message || "").toLowerCase();
  if (code === "42P01" || code === "PGRST205") return true;
  const nossa = msg.includes("kb_") || msg.includes("sistema_releases");
  if (code === "PGRST204" || code === "42703") return nossa;
  return nossa && (msg.includes("does not exist") || msg.includes("could not find"));
}

export interface Autor { id: string; nome: string }

const COLUNAS_RESUMO =
  "id, slug, titulo, tipo, modulo, telas, fontes, resumo, tags, publico, ordem, status, versao, rascunho_por, rascunho_em, origem, revisao_pendente_desde, revisao_motivo, revisar_ate, criado_por_nome, criado_em, publicado_por_nome, publicado_em, atualizado_em";
const COLUNAS_ARTIGO = `${COLUNAS_RESUMO}, corpo, rascunho`;

const paraResumo = (r: any): ArtigoResumo => ({ ...r, tem_rascunho: !!r.rascunho_em });
const paraArtigo = (r: any): Artigo => ({ ...r, corpo: Array.isArray(r.corpo) ? r.corpo : [], rascunho: r.rascunho ?? null });

// -----------------------------------------------------------------------------
// Responsáveis
// -----------------------------------------------------------------------------
export async function responsaveis(): Promise<{ porModulo: Responsaveis; nomes: Record<string, string> }> {
  const { data, error } = await sb.from("kb_responsaveis").select("modulo, user_id, user_nome");
  if (error) throw error;
  const porModulo: Responsaveis = {}, nomes: Record<string, string> = {};
  for (const r of data || []) { porModulo[r.modulo] = r.user_id; nomes[r.modulo] = r.user_nome || ""; }
  return { porModulo, nomes };
}

export async function definirResponsavel(modulo: string, userId: string, userNome: string): Promise<void> {
  const { error } = await sb.from("kb_responsaveis").upsert({ modulo, user_id: userId, user_nome: userNome, atualizado_em: new Date().toISOString() }, { onConflict: "modulo" });
  if (error) throw error;
}

// -----------------------------------------------------------------------------
// Leitura
// -----------------------------------------------------------------------------
export async function listar(f: { modulo?: string; q?: string; status?: string[] } = {}): Promise<ArtigoResumo[]> {
  let q = sb.from("kb_artigos").select(COLUNAS_RESUMO).order("modulo").order("ordem").order("titulo").limit(1000);
  if (f.modulo) q = q.eq("modulo", f.modulo);
  if (f.status?.length) q = q.in("status", f.status);
  const ts = f.q ? consultaTs(f.q) : "";
  if (ts) q = q.textSearch("busca", ts, { config: "simple" });
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(paraResumo);
}

/** "/pos/123/x" → ["/pos/123/x", "/pos/123", "/pos"] — telas que podem documentar o pathname. */
export function prefixosDaTela(pathname: string): string[] {
  const partes = pathname.split("/").filter(Boolean);
  const out: string[] = [];
  for (let i = partes.length; i >= 1; i--) out.push("/" + partes.slice(0, i).join("/"));
  return out;
}

/** Artigos PUBLICADOS cuja lista de telas cobre o pathname (com corpo). */
export async function publicadosDaTela(pathname: string): Promise<Artigo[]> {
  const prefixos = prefixosDaTela(pathname);
  if (!prefixos.length) return [];
  const { data, error } = await sb.from("kb_artigos").select(COLUNAS_ARTIGO).eq("status", "publicado").overlaps("telas", prefixos).limit(200);
  if (error) throw error;
  return (data || []).map(paraArtigo);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function obter(idOuSlug: string): Promise<Artigo | null> {
  const col = UUID.test(idOuSlug) ? "id" : "slug";
  const { data, error } = await sb.from("kb_artigos").select(COLUNAS_ARTIGO).eq(col, idOuSlug).maybeSingle();
  if (error) throw error;
  return data ? paraArtigo(data) : null;
}

export async function versoes(artigoId: string) {
  const { data, error } = await sb.from("kb_artigo_versoes")
    .select("versao, titulo, resumo_mudanca, relevante, publicado_por_nome, publicado_em")
    .eq("artigo_id", artigoId).order("versao", { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}

// -----------------------------------------------------------------------------
// Escrita
// -----------------------------------------------------------------------------
async function slugLivre(base: string): Promise<string> {
  const { data, error } = await sb.from("kb_artigos").select("slug").like("slug", `${base}%`).limit(200);
  if (error) throw error;
  const usados = new Set((data || []).map((r: any) => r.slug));
  if (!usados.has(base)) return base;
  for (let i = 2; i < 500; i++) if (!usados.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now()}`;
}

export async function criar(
  c: Conteudo,
  meta: { modulo: string; fontes?: string[]; publico?: string[]; origem: OrigemArtigo; slug?: string },
  autor: Autor,
): Promise<Artigo> {
  const slug = await slugLivre(meta.slug || slugDoArtigo(meta.modulo, c.titulo));
  const { data, error } = await sb.from("kb_artigos").insert({
    slug, titulo: c.titulo, tipo: c.tipo, modulo: meta.modulo, telas: c.telas, fontes: meta.fontes ?? [], resumo: c.resumo, corpo: c.corpo,
    tags: c.tags, publico: meta.publico ?? [], ordem: c.ordem, status: "rascunho", versao: 0, origem: meta.origem,
    texto_busca: textoDeBusca(c.titulo, c.resumo, c.corpo, c.tags),
    criado_por: autor.id, criado_por_nome: autor.nome, rascunho_por: autor.nome, rascunho_em: new Date().toISOString(),
  }).select(COLUNAS_ARTIGO).single();
  if (error) throw error;
  return paraArtigo(data);
}

/** Salva a edição. Nunca publicado → grava nas colunas; já publicado → fica em `rascunho`. */
export async function salvarRascunho(a: Artigo, c: Conteudo, autor: Autor): Promise<Artigo> {
  const agora = new Date().toISOString();
  const patch = a.status === "publicado" || a.versao > 0
    ? { rascunho: c, rascunho_por: autor.nome, rascunho_em: agora, atualizado_em: agora }
    : {
        titulo: c.titulo, resumo: c.resumo, corpo: c.corpo, tipo: c.tipo, telas: c.telas, tags: c.tags, ordem: c.ordem,
        texto_busca: textoDeBusca(c.titulo, c.resumo, c.corpo, c.tags), rascunho_por: autor.nome, rascunho_em: agora, atualizado_em: agora,
      };
  const { data, error } = await sb.from("kb_artigos").update(patch).eq("id", a.id).select(COLUNAS_ARTIGO).single();
  if (error) throw error;
  return paraArtigo(data);
}

export async function publicar(a: Artigo, opts: { resumo_mudanca?: string | null; relevante?: boolean }, autor: Autor): Promise<Artigo> {
  const c = a.rascunho ?? conteudoVigente(a);
  const versao = a.versao + 1;
  const agora = new Date().toISOString();
  const { data, error } = await sb.from("kb_artigos").update({
    titulo: c.titulo, resumo: c.resumo, corpo: c.corpo, tipo: c.tipo, telas: c.telas, tags: c.tags, ordem: c.ordem,
    texto_busca: textoDeBusca(c.titulo, c.resumo, c.corpo, c.tags),
    status: "publicado", versao, rascunho: null, rascunho_por: null, rascunho_em: null,
    revisao_pendente_desde: null, revisao_motivo: null, revisar_ate: validadePadrao(),
    publicado_por: autor.id, publicado_por_nome: autor.nome, publicado_em: agora, atualizado_em: agora,
  }).eq("id", a.id).eq("versao", a.versao).select(COLUNAS_ARTIGO).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Outra pessoa publicou este artigo agora há pouco. Recarregue e confira."), { http: 409 });
  const { error: e2 } = await sb.from("kb_artigo_versoes").insert({
    artigo_id: a.id, versao, titulo: c.titulo, resumo: c.resumo, corpo: c.corpo,
    resumo_mudanca: opts.resumo_mudanca || (versao === 1 ? "Primeira publicação" : null), relevante: !!opts.relevante,
    publicado_por: autor.id, publicado_por_nome: autor.nome, publicado_em: agora,
  });
  if (e2) console.error("[conhecimento] versão não gravada:", e2.message);
  return paraArtigo(data);
}

export async function descartarRascunho(a: Artigo): Promise<Artigo> {
  if (a.versao === 0) throw Object.assign(new Error("Artigo nunca publicado: arquive em vez de descartar."), { http: 400 });
  const { data, error } = await sb.from("kb_artigos").update({ rascunho: null, rascunho_por: null, rascunho_em: null, atualizado_em: new Date().toISOString() })
    .eq("id", a.id).select(COLUNAS_ARTIGO).single();
  if (error) throw error;
  return paraArtigo(data);
}

export async function mudarStatus(a: Artigo, para: "arquivado" | "reabrir"): Promise<Artigo> {
  const status = para === "arquivado" ? "arquivado" : a.versao > 0 ? "publicado" : "rascunho";
  const { data, error } = await sb.from("kb_artigos").update({ status, atualizado_em: new Date().toISOString() }).eq("id", a.id).select(COLUNAS_ARTIGO).single();
  if (error) throw error;
  return paraArtigo(data);
}

export async function atualizarMeta(id: string, meta: { modulo?: string; fontes?: string[]; publico?: string[] }): Promise<void> {
  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (meta.modulo) patch.modulo = meta.modulo;
  if (meta.fontes) patch.fontes = meta.fontes;
  if (meta.publico) patch.publico = meta.publico;
  const { error } = await sb.from("kb_artigos").update(patch).eq("id", id);
  if (error) throw error;
}

// -----------------------------------------------------------------------------
// Retorno do leitor e leituras
// -----------------------------------------------------------------------------
export type TipoFeedbackKb = "ajudou" | "nao_ajudou" | "desatualizado";

export async function registrarFeedback(a: Artigo, autor: Autor, f: { tipo: TipoFeedbackKb; comentario?: string | null; tela?: string | null }): Promise<void> {
  const { error } = await sb.from("kb_feedback").insert({
    artigo_id: a.id, versao: a.versao, user_id: autor.id, user_nome: autor.nome, tipo: f.tipo,
    comentario: (f.comentario || "").trim().slice(0, 2000) || null, tela: f.tela || null,
  });
  if (error) throw error;
}

export async function registrarLeitura(a: Artigo, userId: string, tela?: string | null): Promise<void> {
  const { error } = await sb.from("kb_leituras").upsert(
    { artigo_id: a.id, user_id: userId, versao: a.versao, tela: tela || null, lido_em: new Date().toISOString() },
    { onConflict: "artigo_id,user_id,versao" },
  );
  if (error) throw error;
}

export async function feedbackAberto(): Promise<any[]> {
  const { data, error } = await sb.from("kb_feedback")
    .select("id, artigo_id, versao, user_nome, tipo, comentario, tela, criado_em, kb_artigos(titulo, slug, modulo)")
    .is("resolvido_em", null).in("tipo", ["nao_ajudou", "desatualizado"]).order("criado_em", { ascending: false }).limit(200);
  if (error) throw error;
  return data || [];
}

export async function resolverFeedback(id: string, por: string): Promise<void> {
  const { error } = await sb.from("kb_feedback").update({ resolvido_em: new Date().toISOString(), resolvido_por: por }).eq("id", id);
  if (error) throw error;
}

// -----------------------------------------------------------------------------
// Notificação (respeita o silenciamento do módulo, regra do portal)
// -----------------------------------------------------------------------------
export async function notificar(userId: string | null | undefined, n: { titulo: string; descricao: string; link: string }): Promise<void> {
  if (!userId) return;
  try {
    const { data: pref } = await sb.from("portal_permissoes").select("user_id, categoria, notif_silenciado").eq("user_id", userId).maybeSingle();
    if (pref && filtrarDestinatarios("conhecimento", [pref as any]).length === 0) return;
    await sb.from("portal_notificacoes").insert({ user_id: userId, tipo: "sistema", titulo: n.titulo, descricao: n.descricao, link: n.link });
  } catch { /* best-effort */ }
}

export async function nomeDoUsuario(userId: string, fallback: string | null): Promise<string> {
  try {
    const { data } = await sb.from("financeiro_usu").select("nome").eq("id", userId).maybeSingle();
    return ((data as any)?.nome as string) || fallback || "Usuário";
  } catch { return fallback || "Usuário"; }
}
