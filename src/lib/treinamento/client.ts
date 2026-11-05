"use client";
// TREINAMENTO — chamadas do navegador às rotas /api/treinamento/*.

import { authHeaders } from "@/lib/auth/client";
import type { Bloco } from "@/lib/conhecimento/blocos";
import type { Atribuicao, Etapa, Pergunta, Progresso, Situacao, Trilha, TrilhaEntrada } from "./regras";

export class ErroApi extends Error {
  status: number; migracaoFaltando: boolean;
  constructor(msg: string, status: number, migracaoFaltando = false) { super(msg); this.status = status; this.migracaoFaltando = migracaoFaltando; }
}
async function chamar<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, cache: "no-store", headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(await authHeaders()), ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new ErroApi(j.erro || `Erro ${r.status}`, r.status, j.migracaoFaltando === true);
  return j as T;
}

export interface MinhaTrilha { trilha: Trilha; atribuicao: Atribuicao; progresso: Progresso; situacao: Situacao; etapas: number }
export interface ArtigoPublicado { id: string; titulo: string; modulo: string; telas: string[]; resumo: string | null }
export interface ListaResposta { minhas: MinhaTrilha[]; gerir: Trilha[]; artigos: ArtigoPublicado[]; podeGerir: boolean; modulosQueGere: string[] | null; hoje: string }
export const listar = (artigos = false) => chamar<ListaResposta>(`/api/treinamento${artigos ? "?artigos=1" : ""}`);
export const criarTrilha = (t: TrilhaEntrada) => chamar<{ trilha: Trilha }>("/api/treinamento", { method: "POST", body: JSON.stringify(t) });

export interface ArtigoDaEtapa { id: string; slug: string; titulo: string; resumo: string | null; corpo: Bloco[]; versao: number; status: string; modulo: string }
export interface MinhaSituacao {
  atribuicao: Atribuicao; etapas: Etapa[]; lidas: string[];
  prova: { perguntas: Omit<Pergunta, "correta" | "explicacao">[]; podeFazer: boolean; aprovado: boolean; ultima: { nota: number; aprovado: boolean; criado_em: string; erradas: string[] } | null };
  progresso: Progresso; situacao: Situacao;
}
export interface TrilhaResposta {
  trilha: Trilha; etapas: Etapa[]; artigos: Record<string, ArtigoDaEtapa>; minha: MinhaSituacao | null; podeGerir: boolean;
  perguntas?: Pergunta[]; pessoas?: { id: string; nome: string; categoria: string | null }[];
}
export const obterTrilha = (id: string, pessoas = false) => chamar<TrilhaResposta>(`/api/treinamento/${id}${pessoas ? "?pessoas=1" : ""}`);
export const acaoTrilha = (id: string, corpo: Record<string, unknown>) => chamar<{ trilha?: Trilha; atribuidas?: number }>(`/api/treinamento/${id}`, { method: "PATCH", body: JSON.stringify(corpo) });
export const marcarLido = (id: string, etapaId: string) => chamar<{ minha: MinhaSituacao }>(`/api/treinamento/${id}`, { method: "POST", body: JSON.stringify({ acao: "li", etapa_id: etapaId }) });
export interface ResultadoProva { acertos: number; total: number; nota: number; aprovado: boolean; erradas: string[]; semResposta: string[]; revisao: { id: string; explicacao: string | null; certa: string }[] }
export const enviarProva = (id: string, respostas: Record<string, number>) => chamar<{ resultado: ResultadoProva }>(`/api/treinamento/${id}`, { method: "POST", body: JSON.stringify({ acao: "prova", respostas }) });
export const atribuirPessoas = (id: string, userIds: string[]) => chamar<{ atribuidas: number }>(`/api/treinamento/${id}`, { method: "POST", body: JSON.stringify({ acao: "atribuir", user_ids: userIds }) });
export const reabrir = (id: string, atribuicaoId: string) => chamar(`/api/treinamento/${id}`, { method: "POST", body: JSON.stringify({ acao: "reabrir", atribuicao_id: atribuicaoId }) });

export interface LinhaEquipe { atribuicao: Atribuicao; situacao: Situacao; dias: number; pct: number }
export interface Resumo { total: number; concluidas: number; atrasadas: number; emAndamento: number; pendentes: number; notaMedia: number | null }
export const painelEquipe = () => chamar<{ hoje: string; porTrilha: { trilha: Trilha; linhas: LinhaEquipe[]; resumo: Resumo }[]; resumo: Resumo }>("/api/treinamento/equipe");
export const sugerirPerguntas = (artigoId: string, quantas = 3) => chamar<{ perguntas: Omit<Pergunta, "id" | "trilha_id">[] }>("/api/treinamento/perguntas-ia", { method: "POST", body: JSON.stringify({ artigo_id: artigoId, quantas }) });
