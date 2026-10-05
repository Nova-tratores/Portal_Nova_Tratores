"use client";
// BASE DE CONHECIMENTO — chamadas do navegador às rotas /api/conhecimento/*.

import { authHeaders } from "@/lib/auth/client";
import type { Artigo, ArtigoResumo, Conteudo } from "./artigos";
import type { Bloco } from "./blocos";

export class ErroApi extends Error {
  status: number;
  migracaoFaltando: boolean;
  constructor(msg: string, status: number, migracaoFaltando = false) {
    super(msg);
    this.status = status;
    this.migracaoFaltando = migracaoFaltando;
  }
}

async function chamar<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(await authHeaders()), ...(init.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new ErroApi(j.erro || `Erro ${r.status}`, r.status, j.migracaoFaltando === true);
  return j as T;
}

export type ResumoComPermissao = ArtigoResumo & { pode_editar: boolean; pode_publicar: boolean };

export interface ListaResposta {
  artigos: ResumoComPermissao[];
  podeCriar: boolean;
  responsaveis: Record<string, string>;
  souResponsavelDe: string[];
}

export function listarArtigos(f: { q?: string; modulo?: string; fila?: boolean; arquivados?: boolean } = {}): Promise<ListaResposta> {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.modulo) sp.set("modulo", f.modulo);
  if (f.fila) sp.set("fila", "1");
  if (f.arquivados) sp.set("arquivados", "1");
  return chamar(`/api/conhecimento?${sp}`);
}

export function artigosDaTelaApi(tela: string): Promise<{ artigos: Artigo[]; podeEditar: boolean }> {
  return chamar(`/api/conhecimento?tela=${encodeURIComponent(tela)}`);
}

export interface ArtigoResposta {
  artigo: Artigo;
  podeEditar: boolean;
  podePublicar: boolean;
  responsavel: string | null;
  versoes: { versao: number; titulo: string; resumo_mudanca: string | null; relevante: boolean; publicado_por_nome: string | null; publicado_em: string }[];
}

export function obterArtigo(idOuSlug: string): Promise<ArtigoResposta> {
  return chamar(`/api/conhecimento/${encodeURIComponent(idOuSlug)}`);
}

export function criarArtigo(dados: Conteudo & { modulo: string; origem?: "manual" | "ia" }): Promise<{ artigo: Artigo }> {
  return chamar("/api/conhecimento", { method: "POST", body: JSON.stringify(dados) });
}

export function acaoArtigo(id: string, corpo: Record<string, unknown>): Promise<{ artigo?: Artigo }> {
  return chamar(`/api/conhecimento/${id}`, { method: "PATCH", body: JSON.stringify(corpo) });
}

export function retornoDoLeitor(id: string, tipo: "leitura" | "ajudou" | "nao_ajudou" | "desatualizado", extra: { comentario?: string; tela?: string } = {}): Promise<unknown> {
  return chamar(`/api/conhecimento/${id}`, { method: "POST", body: JSON.stringify({ tipo, ...extra }) });
}

export function rascunhar(dados: { modo: "ia" | "converter"; material: string; titulo?: string; tela?: string; instrucao?: string }): Promise<{ titulo?: string; resumo?: string | null; corpo: Bloco[] }> {
  return chamar("/api/conhecimento/rascunho", { method: "POST", body: JSON.stringify(dados) });
}

export interface Retorno {
  id: string; artigo_id: string; versao: number; user_nome: string | null; tipo: "nao_ajudou" | "desatualizado";
  comentario: string | null; tela: string | null; criado_em: string; artigo: { titulo: string; slug: string; modulo: string };
}
export function listarRetornos(): Promise<{ retornos: Retorno[] }> {
  return chamar("/api/conhecimento/retornos");
}
export function resolverRetorno(id: string): Promise<unknown> {
  return chamar("/api/conhecimento/retornos", { method: "PATCH", body: JSON.stringify({ id }) });
}
