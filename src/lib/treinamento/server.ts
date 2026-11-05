/* eslint-disable @typescript-eslint/no-explicit-any */
// TREINAMENTO (LMS) — acesso ao banco (SERVIDOR, service role). Migration: sql/treinamento.sql.
// Regras puras em ./regras.ts. As tabelas lms_* têm RLS sem policy: só este arquivo fala com elas.

import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import { filtrarDestinatarios } from "@/lib/notif/prefs";
import type { Bloco } from "@/lib/conhecimento/blocos";
import {
  corrigir, dataLocal, embaralharDeterministico, etapasDaAtribuicao, perguntasDaAtribuicao, podeFazerProva, prazoDaTrilha, progresso, recebeSozinho, situacaoEfetiva,
  type Atribuicao, type Etapa, type Pergunta, type Trilha, type TrilhaEntrada,
} from "./regras";

export const MSG_MIGRATION = "Treinamento ainda não instalado: rode sql/treinamento.sql no SQL Editor do Supabase.";
export function migrationFaltou(e: any): boolean {
  const code = String(e?.code || ""), msg = String(e?.message || "").toLowerCase();
  if (code === "42P01" || code === "PGRST205") return msg.includes("lms_") || msg.includes("schema cache");
  return msg.includes("lms_") && (msg.includes("does not exist") || msg.includes("could not find"));
}

export interface Autor { id: string; nome: string }
export interface ArtigoDaEtapa { id: string; slug: string; titulo: string; resumo: string | null; corpo: Bloco[]; versao: number; status: string; modulo: string }

// -----------------------------------------------------------------------------
// Trilhas
// -----------------------------------------------------------------------------
export async function listarTrilhas(f: { status?: string[]; modulos?: string[] } = {}): Promise<Trilha[]> {
  let q = sb.from("lms_trilhas").select("*").order("titulo");
  if (f.status?.length) q = q.in("status", f.status);
  if (f.modulos) q = q.in("modulo", f.modulos);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Trilha[];
}

export async function obterTrilha(id: string): Promise<{ trilha: Trilha; etapas: Etapa[]; perguntas: Pergunta[]; artigos: Record<string, ArtigoDaEtapa> } | null> {
  const { data: t, error } = await sb.from("lms_trilhas").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!t) return null;
  const [{ data: etapas, error: e1 }, { data: perguntas, error: e2 }] = await Promise.all([
    sb.from("lms_etapas").select("*").eq("trilha_id", id).order("ordem"),
    sb.from("lms_perguntas").select("*").eq("trilha_id", id).order("ordem"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const ids = (etapas || []).map((e: any) => e.artigo_id);
  const artigos: Record<string, ArtigoDaEtapa> = {};
  if (ids.length) {
    const { data: arts, error: e3 } = await sb.from("kb_artigos").select("id, slug, titulo, resumo, corpo, versao, status, modulo").in("id", ids);
    if (e3) throw e3;
    for (const a of arts || []) artigos[a.id] = { ...(a as any), corpo: Array.isArray(a.corpo) ? a.corpo : [] };
  }
  return { trilha: t as Trilha, etapas: (etapas || []) as Etapa[], perguntas: (perguntas || []).map(normPergunta), artigos };
}
const normPergunta = (p: any): Pergunta => ({ ...p, opcoes: Array.isArray(p.opcoes) ? p.opcoes : [] });

export async function criarTrilha(t: TrilhaEntrada, autor: Autor): Promise<Trilha> {
  const { data, error } = await sb.from("lms_trilhas").insert({
    titulo: t.titulo, descricao: t.descricao, modulo: t.modulo, publico: t.publico, obrigatoria: t.obrigatoria, nota_minima: t.nota_minima, prazo_dias: t.prazo_dias,
    status: "rascunho", criado_por: autor.id, criado_por_nome: autor.nome,
  }).select("*").single();
  if (error) throw error;
  await gravarEtapas(data.id, t.etapas);
  return data as Trilha;
}

export async function atualizarTrilha(id: string, t: TrilhaEntrada): Promise<Trilha> {
  const { data, error } = await sb.from("lms_trilhas").update({
    titulo: t.titulo, descricao: t.descricao, modulo: t.modulo, publico: t.publico, obrigatoria: t.obrigatoria, nota_minima: t.nota_minima, prazo_dias: t.prazo_dias, atualizado_em: new Date().toISOString(),
  }).eq("id", id).select("*").single();
  if (error) throw error;
  await gravarEtapas(id, t.etapas);
  return data as Trilha;
}

/** Etapas = artigos em ordem. Mantém o id da etapa de artigo que já estava (progresso não se perde). */
async function gravarEtapas(trilhaId: string, artigos: string[]): Promise<void> {
  const { data: atuais, error } = await sb.from("lms_etapas").select("id, artigo_id").eq("trilha_id", trilhaId);
  if (error) throw error;
  const porArtigo = new Map((atuais || []).map((e: any) => [e.artigo_id, e.id]));
  const remover = (atuais || []).filter((e: any) => !artigos.includes(e.artigo_id)).map((e: any) => e.id);
  if (remover.length) { const { error: e1 } = await sb.from("lms_etapas").delete().in("id", remover); if (e1) throw e1; }
  for (let i = 0; i < artigos.length; i++) {
    const id = porArtigo.get(artigos[i]);
    const { error: e2 } = id
      ? await sb.from("lms_etapas").update({ ordem: (i + 1) * 10 }).eq("id", id)
      : await sb.from("lms_etapas").insert({ trilha_id: trilhaId, artigo_id: artigos[i], ordem: (i + 1) * 10 });
    if (e2) throw e2;
  }
}

export async function gravarPerguntas(trilhaId: string, perguntas: Omit<Pergunta, "id" | "trilha_id">[] & { id?: string }[]): Promise<void> {
  const { data: atuais, error } = await sb.from("lms_perguntas").select("id").eq("trilha_id", trilhaId);
  if (error) throw error;
  const manter = new Set(perguntas.map((p: any) => p.id).filter(Boolean));
  const apagar = (atuais || []).map((p: any) => p.id).filter((id: string) => !manter.has(id));
  if (apagar.length) { const { error: e1 } = await sb.from("lms_perguntas").delete().in("id", apagar); if (e1) throw e1; }
  for (let i = 0; i < perguntas.length; i++) {
    const p: any = perguntas[i];
    const linha = { trilha_id: trilhaId, artigo_id: p.artigo_id, ordem: i + 1, enunciado: p.enunciado, opcoes: p.opcoes, correta: p.correta, explicacao: p.explicacao, ativa: p.ativa !== false };
    const { error: e2 } = p.id ? await sb.from("lms_perguntas").update(linha).eq("id", p.id) : await sb.from("lms_perguntas").insert(linha);
    if (e2) throw e2;
  }
}

export async function mudarStatusTrilha(id: string, status: "ativa" | "arquivada" | "rascunho"): Promise<Trilha> {
  const { data, error } = await sb.from("lms_trilhas").update({ status, atualizado_em: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error) throw error;
  return data as Trilha;
}

// -----------------------------------------------------------------------------
// Atribuições
// -----------------------------------------------------------------------------
export async function atribuicoesDoUsuario(userId: string): Promise<Atribuicao[]> {
  const { data, error } = await sb.from("lms_atribuicoes").select("*").eq("user_id", userId).order("criado_em", { ascending: false });
  if (error) throw error;
  return (data || []) as Atribuicao[];
}

/** A atribuição "vigente" de uma trilha para a pessoa = a de maior ciclo. */
export function vigente(lista: Atribuicao[], trilhaId: string): Atribuicao | null {
  return lista.filter((a) => a.trilha_id === trilhaId).sort((x, y) => y.ciclo - x.ciclo)[0] ?? null;
}

async function usuariosDaCategoria(categorias: string[]): Promise<{ id: string; nome: string }[]> {
  if (!categorias.length) return [];
  const { data: perms, error } = await sb.from("portal_permissoes").select("user_id, categoria").in("categoria", categorias);
  if (error) throw error;
  const ids = (perms || []).map((p: any) => p.user_id);
  if (!ids.length) return [];
  const { data: usu } = await sb.from("financeiro_usu").select("id, nome, ativo").in("id", ids);
  return (usu || []).filter((u: any) => u.ativo !== false).map((u: any) => ({ id: u.id, nome: u.nome }));
}

export async function atribuir(trilha: Trilha, pessoas: { id: string; nome: string }[], origem: "categoria" | "manual", porNome?: string): Promise<number> {
  if (!pessoas.length) return 0;
  const { data: existentes, error } = await sb.from("lms_atribuicoes").select("user_id").eq("trilha_id", trilha.id).eq("ciclo", 1);
  if (error) throw error;
  const ja = new Set((existentes || []).map((e: any) => e.user_id));
  const novas = pessoas.filter((p) => !ja.has(p.id));
  if (!novas.length) return 0;
  const prazo = prazoDaTrilha(trilha);
  const { error: e2 } = await sb.from("lms_atribuicoes").insert(novas.map((p) => ({ trilha_id: trilha.id, user_id: p.id, user_nome: p.nome, ciclo: 1, origem, etapas: null, prazo })));
  if (e2) throw e2;
  for (const p of novas) await notificar(p.id, { titulo: "Treinamento para fazer", descricao: `${trilha.titulo} · até ${prazo.split("-").reverse().join("/")}${porNome ? ` · pedido por ${porNome}` : ""}`, link: `/treinamento/${trilha.id}` });
  return novas.length;
}

/** Trilha ativa com público por categoria: todo mundo da categoria recebe (chamado ao ativar). */
export async function atribuirPeloPublico(trilha: Trilha): Promise<number> {
  if (trilha.status !== "ativa") return 0;
  return atribuir(trilha, await usuariosDaCategoria(trilha.publico), "categoria");
}

/** Garante as trilhas da categoria para UMA pessoa (chamado quando ela abre /treinamento: cobre usuário novo sem cron). */
export async function garantirAtribuicoes(user: { id: string; nome: string; categoria: string | null }): Promise<void> {
  const trilhas = await listarTrilhas({ status: ["ativa"] });
  for (const t of trilhas) if (recebeSozinho(t, user.categoria)) await atribuir(t, [user], "categoria");
}

// -----------------------------------------------------------------------------
// Fazer a trilha
// -----------------------------------------------------------------------------
export interface Situacao {
  atribuicao: Atribuicao;
  etapas: Etapa[];
  lidas: string[];
  prova: { perguntas: Omit<Pergunta, "correta" | "explicacao">[]; podeFazer: boolean; aprovado: boolean; ultima: { nota: number; aprovado: boolean; criado_em: string; erradas: string[] } | null };
  progresso: ReturnType<typeof progresso>;
  situacao: ReturnType<typeof situacaoEfetiva>;
}

export async function situacaoDaPessoa(d: NonNullable<Awaited<ReturnType<typeof obterTrilha>>>, a: Atribuicao): Promise<Situacao> {
  const [{ data: prog, error: e1 }, { data: tent, error: e2 }] = await Promise.all([
    sb.from("lms_progresso").select("etapa_id").eq("atribuicao_id", a.id),
    sb.from("lms_tentativas").select("nota, aprovado, criado_em, respostas").eq("atribuicao_id", a.id).order("criado_em", { ascending: false }).limit(1),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const etapas = etapasDaAtribuicao(d.etapas, a);
  const lidas = new Set((prog || []).map((p: any) => p.etapa_id as string));
  const perguntas = embaralharDeterministico(perguntasDaAtribuicao(d.perguntas, d.etapas, a), `${a.user_id}:${a.id}`);
  const aprovado = a.situacao === "concluida" || !!tent?.[0]?.aprovado;
  const p = progresso(etapas, lidas, perguntas.length > 0, aprovado);
  const ult = tent?.[0];
  const erradas = ult ? corrigir(perguntas, (ult.respostas || {}) as Record<string, unknown>, d.trilha.nota_minima).erradas : [];
  return {
    atribuicao: a, etapas, lidas: Array.from(lidas),
    prova: { perguntas: perguntas.map((p) => ({ id: p.id, trilha_id: p.trilha_id, artigo_id: p.artigo_id, ordem: p.ordem, enunciado: p.enunciado, opcoes: p.opcoes, ativa: p.ativa })), podeFazer: podeFazerProva(p), aprovado, ultima: ult ? { nota: ult.nota, aprovado: ult.aprovado, criado_em: ult.criado_em, erradas } : null },
    progresso: p, situacao: situacaoEfetiva(a, dataLocal(new Date())),
  };
}

export async function concluirEtapa(a: Atribuicao, etapa: Etapa, versaoArtigo: number): Promise<void> {
  const { error } = await sb.from("lms_progresso").upsert({ atribuicao_id: a.id, etapa_id: etapa.id, versao_artigo: versaoArtigo, concluida_em: new Date().toISOString() }, { onConflict: "atribuicao_id,etapa_id" });
  if (error) throw error;
  if (a.situacao === "pendente") await sb.from("lms_atribuicoes").update({ situacao: "em_andamento" }).eq("id", a.id);
}

/** Sem prova: ler tudo conclui. */
export async function concluirSemProva(a: Atribuicao): Promise<void> {
  const { error } = await sb.from("lms_atribuicoes").update({ situacao: "concluida", concluida_em: new Date().toISOString() }).eq("id", a.id).neq("situacao", "concluida");
  if (error) throw error;
}

export async function responderProva(d: NonNullable<Awaited<ReturnType<typeof obterTrilha>>>, a: Atribuicao, respostas: Record<string, unknown>) {
  const perguntas = perguntasDaAtribuicao(d.perguntas, d.etapas, a);
  const c = corrigir(perguntas, respostas, d.trilha.nota_minima);
  const limpas: Record<string, number> = {};
  for (const p of perguntas) if (typeof respostas[p.id] === "number") limpas[p.id] = respostas[p.id] as number;
  const { error } = await sb.from("lms_tentativas").insert({ atribuicao_id: a.id, respostas: limpas, acertos: c.acertos, total: c.total, nota: c.nota, aprovado: c.aprovado });
  if (error) throw error;
  const patch: Record<string, unknown> = { nota: c.nota, tentativas: a.tentativas + 1, situacao: c.aprovado ? "concluida" : "em_andamento" };
  if (c.aprovado) patch.concluida_em = new Date().toISOString();
  const { error: e2 } = await sb.from("lms_atribuicoes").update(patch).eq("id", a.id);
  if (e2) throw e2;
  // o que errou vem com a explicação (gabarito não vai para o navegador)
  const revisao = perguntas.filter((p) => c.erradas.includes(p.id) || c.semResposta.includes(p.id)).map((p) => ({ id: p.id, explicacao: p.explicacao, certa: p.opcoes[p.correta] }));
  return { ...c, revisao };
}

// -----------------------------------------------------------------------------
// Reciclagem: artigo republicado como "mudança relevante"
// -----------------------------------------------------------------------------
export async function agendarReciclagem(artigo: { id: string; titulo: string; versao: number }): Promise<number> {
  const { data: etapas, error } = await sb.from("lms_etapas").select("id, trilha_id").eq("artigo_id", artigo.id);
  if (error) { if (migrationFaltou(error)) return 0; throw error; }
  let criadas = 0;
  for (const e of etapas || []) {
    const { data: t } = await sb.from("lms_trilhas").select("*").eq("id", e.trilha_id).eq("status", "ativa").maybeSingle();
    if (!t) continue;
    const trilha = t as Trilha;
    const { data: feitas } = await sb.from("lms_atribuicoes").select("*").eq("trilha_id", trilha.id).order("ciclo", { ascending: false });
    const porUser = new Map<string, Atribuicao>();
    for (const a of (feitas || []) as Atribuicao[]) if (!porUser.has(a.user_id)) porUser.set(a.user_id, a);
    const prazo = prazoDaTrilha(trilha);
    for (const a of porUser.values()) {
      if (a.situacao !== "concluida") continue; // quem ainda está fazendo lê a versão nova na hora
      const { error: e2 } = await sb.from("lms_atribuicoes").insert({
        trilha_id: trilha.id, user_id: a.user_id, user_nome: a.user_nome, ciclo: a.ciclo + 1, origem: "reciclagem", etapas: [e.id], prazo,
        motivo: `“${artigo.titulo}” mudou (versão ${artigo.versao})`,
      });
      if (e2) { console.error("[treinamento] reciclagem:", e2.message); continue; }
      criadas++;
      await notificar(a.user_id, { titulo: "Reciclagem de treinamento", descricao: `“${artigo.titulo}” mudou — releia e responda até ${prazo.split("-").reverse().join("/")}`, link: `/treinamento/${trilha.id}` });
    }
  }
  return criadas;
}

// -----------------------------------------------------------------------------
// Painel da equipe
// -----------------------------------------------------------------------------
export async function painelEquipe(modulos: string[] | null): Promise<{ trilhas: Trilha[]; atribuicoes: Atribuicao[]; progresso: Record<string, number> }> {
  const trilhas = await listarTrilhas({ status: ["ativa", "rascunho"], modulos: modulos ?? undefined });
  if (!trilhas.length) return { trilhas, atribuicoes: [], progresso: {} };
  const ids = trilhas.map((t) => t.id);
  const { data: atr, error } = await sb.from("lms_atribuicoes").select("*").in("trilha_id", ids).order("criado_em", { ascending: false });
  if (error) throw error;
  const atribuicoes = (atr || []) as Atribuicao[];
  const [{ data: prog }, { data: etapas }] = await Promise.all([
    sb.from("lms_progresso").select("atribuicao_id, etapa_id").in("atribuicao_id", atribuicoes.map((a) => a.id).slice(0, 5000)),
    sb.from("lms_etapas").select("id, trilha_id, ordem, artigo_id").in("trilha_id", ids),
  ]);
  const lidasPor = new Map<string, Set<string>>();
  for (const p of prog || []) (lidasPor.get(p.atribuicao_id) ?? lidasPor.set(p.atribuicao_id, new Set()).get(p.atribuicao_id)!).add(p.etapa_id);
  const progressoPct: Record<string, number> = {};
  for (const a of atribuicoes) {
    const es = etapasDaAtribuicao(((etapas || []) as Etapa[]).filter((e) => e.trilha_id === a.trilha_id), a);
    progressoPct[a.id] = progresso(es, lidasPor.get(a.id) ?? new Set(), true, a.situacao === "concluida").pct;
  }
  return { trilhas, atribuicoes, progresso: progressoPct };
}

export async function reabrirAtribuicao(id: string): Promise<void> {
  const { error } = await sb.from("lms_atribuicoes").update({ situacao: "em_andamento", concluida_em: null }).eq("id", id);
  if (error) throw error;
}

export async function usuariosParaAtribuir(): Promise<{ id: string; nome: string; categoria: string | null }[]> {
  const [{ data: usu }, { data: perms }] = await Promise.all([
    sb.from("financeiro_usu").select("id, nome, ativo").order("nome"),
    sb.from("portal_permissoes").select("user_id, categoria"),
  ]);
  const cat = new Map((perms || []).map((p: any) => [p.user_id, p.categoria]));
  return (usu || []).filter((u: any) => u.ativo !== false).map((u: any) => ({ id: u.id, nome: u.nome, categoria: cat.get(u.id) ?? null }));
}

export async function artigosPublicados(modulo?: string): Promise<{ id: string; titulo: string; modulo: string; telas: string[]; resumo: string | null }[]> {
  let q = sb.from("kb_artigos").select("id, titulo, modulo, telas, resumo, ordem").eq("status", "publicado").order("modulo").order("ordem");
  if (modulo) q = q.eq("modulo", modulo);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as any[];
}

export async function notificar(userId: string, n: { titulo: string; descricao: string; link: string }): Promise<void> {
  try {
    const { data: pref } = await sb.from("portal_permissoes").select("user_id, categoria, notif_silenciado").eq("user_id", userId).maybeSingle();
    if (pref && filtrarDestinatarios("treinamento", [pref as any]).length === 0) return;
    await sb.from("portal_notificacoes").insert({ user_id: userId, tipo: "sistema", titulo: n.titulo, descricao: n.descricao, link: n.link });
  } catch { /* best-effort */ }
}
