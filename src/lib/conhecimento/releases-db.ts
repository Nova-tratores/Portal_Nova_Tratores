/* eslint-disable @typescript-eslint/no-explicit-any */
// BASE DE CONHECIMENTO — versões do sistema e novidades (SERVIDOR, service role).
// Migration: sql/sistema-releases.sql. Regras puras em ./releases.ts.

import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import { chamarIA } from "@/lib/assistente/ia";
import { notificar, responsaveis, type Autor } from "./db";
import { rotuloModulo } from "./modulos";
import {
  artigosAfetados, juntarMotivo, novidadeSemIA, novidadesPorModulo, modulosDoCommit,
  type CommitLido, type MotivoRevisao,
} from "./releases";

export interface ResultadoRelease {
  sha: string;
  jaRegistrada: boolean;
  modulos: string[];
  artigosAfetados: number;
  novidades: number;
}

// -----------------------------------------------------------------------------
// Novidade por IA: reescreve os commits em linguagem de quem usa a tela
// -----------------------------------------------------------------------------
const SISTEMA_NOVIDADE = `Você escreve o aviso "O que mudou" do portal interno da Nova Tratores (concessionária de tratores), em português do Brasil, para funcionários da loja.
Recebe os títulos dos commits de uma versão, de UM módulo do portal.

REGRAS
- Escreva só o que o usuário percebe na tela. Ignore refatoração, teste, nome de arquivo, tabela, rota e função.
- Não invente: se o commit não deixa claro o efeito para o usuário, descreva de forma simples o que o título diz, sem acrescentar detalhe.
- Uma linha por mudança, frase curta, começando pelo que a pessoa passa a poder fazer ou pelo que foi corrigido.
- Sem jargão técnico, sem inglês, sem emojis.

Responda só com JSON: {"titulo": "até 70 caracteres, resume a versão para este módulo", "itens": ["frase 1", "frase 2"]}`;

async function redigirNovidade(modulo: string, commits: CommitLido[]): Promise<{ titulo: string; texto: string; origem: "ia" | "manual" }> {
  const reserva = { titulo: `Mudanças em ${rotuloModulo(modulo)}`, texto: novidadeSemIA(commits), origem: "manual" as const };
  try {
    const r: any = await chamarIA({
      messages: [
        { role: "system", content: SISTEMA_NOVIDADE },
        { role: "user", content: `Módulo: ${rotuloModulo(modulo)}\nCommits:\n${commits.map((c) => `- ${c.titulo}`).join("\n")}`.slice(0, 8000) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    const j = JSON.parse(r?.choices?.[0]?.message?.content || "{}");
    const itens = (Array.isArray(j.itens) ? j.itens : []).map((i: unknown) => (typeof i === "string" ? i.trim() : "")).filter(Boolean).slice(0, 20);
    const titulo = typeof j.titulo === "string" ? j.titulo.trim().slice(0, 120) : "";
    if (!itens.length || !titulo) return reserva;
    return { titulo, texto: itens.map((i: string) => `- ${i}`).join("\n"), origem: "ia" };
  } catch {
    return reserva;
  }
}

// -----------------------------------------------------------------------------
// Registrar uma versão (chamado pelo workflow a cada push na main)
// -----------------------------------------------------------------------------
export async function registrarRelease(p: { sha: string; sha_anterior: string | null; commits: CommitLido[]; arquivos: string[] }): Promise<ResultadoRelease> {
  const { data: ja, error: e0 } = await sb.from("sistema_releases").select("sha, modulos, artigos_afetados, novidades").eq("sha", p.sha).maybeSingle();
  if (e0) throw e0;
  if (ja) return { sha: p.sha, jaRegistrada: true, modulos: ja.modulos || [], artigosAfetados: ja.artigos_afetados || 0, novidades: ja.novidades || 0 };

  const { porModulo } = await responsaveis();
  const conhecidos = new Set(Object.keys(porModulo)); // piloto: só módulos com responsável
  const modulos = Array.from(new Set(p.commits.flatMap((c) => modulosDoCommit(c, conhecidos))));

  const { data: rel, error: e1 } = await sb.from("sistema_releases").insert({
    sha: p.sha, sha_anterior: p.sha_anterior,
    commits: p.commits.map((c) => ({ sha: c.sha, titulo: c.titulo, tipo: c.tipo, escopo: c.escopo, autor: c.autor ?? null, data: c.data ?? null, arquivos: c.arquivos.slice(0, 200) })),
    arquivos: p.arquivos, modulos,
  }).select("id").single();
  if (e1) {
    if (String(e1.code) === "23505") return { sha: p.sha, jaRegistrada: true, modulos, artigosAfetados: 0, novidades: 0 }; // corrida: outro POST gravou
    throw e1;
  }

  // 1) artigos publicados cujas fontes foram tocadas → "pode estar desatualizado"
  const { data: arts, error: e2 } = await sb.from("kb_artigos").select("id, modulo, titulo, fontes, revisao_pendente_desde, revisao_motivo").eq("status", "publicado").limit(2000);
  if (e2) throw e2;
  const afetados = artigosAfetados((arts || []) as any[], p.arquivos);
  const agora = new Date().toISOString();
  const porResp = new Map<string, { artigos: number; novidades: number }>();
  const conta = (modulo: string, campo: "artigos" | "novidades") => {
    const uid = porModulo[modulo];
    if (!uid) return;
    const c = porResp.get(uid) ?? { artigos: 0, novidades: 0 };
    c[campo]++; porResp.set(uid, c);
  };
  for (const af of afetados) {
    const atual = (arts || []).find((a: any) => a.id === af.id) as any;
    const commitsDoModulo = p.commits.filter((c) => modulosDoCommit(c, conhecidos).includes(af.modulo));
    const motivo: MotivoRevisao = juntarMotivo(atual?.revisao_motivo, {
      release: p.sha,
      commits: (commitsDoModulo.length ? commitsDoModulo : p.commits).slice(0, 10).map((c) => ({ sha: c.sha.slice(0, 8), titulo: c.titulo })),
      arquivos: af.arquivos.slice(0, 10),
    });
    const { error } = await sb.from("kb_artigos").update({ revisao_pendente_desde: atual?.revisao_pendente_desde ?? agora, revisao_motivo: motivo, atualizado_em: agora }).eq("id", af.id);
    if (error) console.error("[conhecimento] marcar revisão:", error.message);
    else conta(af.modulo, "artigos");
  }

  // 2) rascunho de novidade por módulo (o responsável revisa e publica)
  let novidades = 0;
  for (const [modulo, commits] of novidadesPorModulo(p.commits, conhecidos)) {
    const n = await redigirNovidade(modulo, commits);
    const { error } = await sb.from("kb_novidades").insert({
      release_id: rel.id, modulo, titulo: n.titulo, texto: n.texto, origem: n.origem, status: "rascunho",
      commits: commits.map((c) => ({ sha: c.sha.slice(0, 8), titulo: c.titulo })),
    });
    if (error) console.error("[conhecimento] novidade:", error.message);
    else { novidades++; conta(modulo, "novidades"); }
  }

  // 3) um aviso por responsável
  for (const [uid, c] of porResp) {
    const partes = [c.artigos ? `${c.artigos} artigo${c.artigos > 1 ? "s" : ""} para conferir` : "", c.novidades ? `${c.novidades} novidade${c.novidades > 1 ? "s" : ""} para aprovar` : ""].filter(Boolean);
    await notificar(uid, { titulo: "O portal mudou: revise a base de conhecimento", descricao: partes.join(" · "), link: c.novidades ? "/conhecimento/novidades" : "/conhecimento?aba=fila" });
  }

  await sb.from("sistema_releases").update({ artigos_afetados: afetados.length, novidades, resumo: { afetados: afetados.map((a) => ({ id: a.id, modulo: a.modulo })) } }).eq("id", rel.id);
  return { sha: p.sha, jaRegistrada: false, modulos, artigosAfetados: afetados.length, novidades };
}

/** Responsável conferiu e o texto continua valendo: tira o selo sem criar versão nova. */
export async function marcarRevisado(artigoId: string): Promise<void> {
  const { error } = await sb.from("kb_artigos").update({ revisao_pendente_desde: null, revisao_motivo: null, atualizado_em: new Date().toISOString() }).eq("id", artigoId);
  if (error) throw error;
}

// -----------------------------------------------------------------------------
// Novidades
// -----------------------------------------------------------------------------
export interface Novidade {
  id: string; release_id: string | null; modulo: string; titulo: string; texto: string;
  status: "rascunho" | "publicado" | "descartado"; origem: "ia" | "manual"; commits: { sha: string; titulo: string }[];
  criado_em: string; publicado_por_nome: string | null; publicado_em: string | null;
}
const COLS = "id, release_id, modulo, titulo, texto, status, origem, commits, criado_em, publicado_por_nome, publicado_em";

export async function novidadesPublicadas(limite = 100): Promise<Novidade[]> {
  const { data, error } = await sb.from("kb_novidades").select(COLS).eq("status", "publicado").order("publicado_em", { ascending: false }).limit(limite);
  if (error) throw error;
  return (data || []) as Novidade[];
}

export async function novidadesRascunho(): Promise<Novidade[]> {
  const { data, error } = await sb.from("kb_novidades").select(COLS).eq("status", "rascunho").order("criado_em", { ascending: false }).limit(200);
  if (error) throw error;
  return (data || []) as Novidade[];
}

export async function idsLidos(userId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await sb.from("kb_novidades_lidas").select("novidade_id").eq("user_id", userId).in("novidade_id", ids);
  if (error) throw error;
  return new Set((data || []).map((r: any) => r.novidade_id));
}

export async function marcarLidas(userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await sb.from("kb_novidades_lidas").upsert(ids.map((id) => ({ novidade_id: id, user_id: userId })), { onConflict: "novidade_id,user_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function obterNovidade(id: string): Promise<Novidade | null> {
  const { data, error } = await sb.from("kb_novidades").select(COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Novidade) ?? null;
}

export async function criarNovidade(n: { modulo: string; titulo: string; texto: string }): Promise<Novidade> {
  const { data, error } = await sb.from("kb_novidades").insert({ ...n, origem: "manual", status: "rascunho" }).select(COLS).single();
  if (error) throw error;
  return data as Novidade;
}

export async function atualizarNovidade(id: string, patch: { titulo?: string; texto?: string; status?: "publicado" | "descartado" | "rascunho" }, autor?: Autor): Promise<Novidade> {
  const agora = new Date().toISOString();
  const linha: Record<string, unknown> = { atualizado_em: agora };
  if (patch.titulo !== undefined) linha.titulo = patch.titulo;
  if (patch.texto !== undefined) linha.texto = patch.texto;
  if (patch.status) {
    linha.status = patch.status;
    if (patch.status === "publicado") { linha.publicado_em = agora; linha.publicado_por = autor?.id ?? null; linha.publicado_por_nome = autor?.nome ?? null; }
  }
  const { data, error } = await sb.from("kb_novidades").update(linha).eq("id", id).select(COLS).single();
  if (error) throw error;
  return data as Novidade;
}

export async function ultimasReleases(limite = 20) {
  const { data, error } = await sb.from("sistema_releases").select("sha, modulos, artigos_afetados, novidades, criado_em, commits").order("criado_em", { ascending: false }).limit(limite);
  if (error) throw error;
  return data || [];
}
