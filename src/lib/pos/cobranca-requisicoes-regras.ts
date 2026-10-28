// Regras PURAS da cobrança de requisições (José, 26/10/2026): "nenhuma requisição passa sem cobrar do cliente".
// Pode ser importado no navegador (sem banco). O robô e as rotas ficam em cobranca-requisicoes.ts.
import { parseValorMisto } from "@/lib/marketing/custos";

export type CobrancaStatus = "a_cobrar" | "cobrada" | "nao_cobrada";

export type ReqCobranca = {
  id?: number | string | null;
  titulo?: string | null;
  tipo?: string | null;
  status?: string | null;
  valor_despeza?: unknown;
  valor_cobrado_cliente?: unknown;
  ordem_servico?: string | null;
  created_at?: string | null;
  cobranca_status?: string | null;
  setor?: string | null;
};

/** Início do controle: 26/10/2026 00:00 de Brasília. Antes disso a carga do SQL marcou como "não cobrada". */
export const INICIO_CONTROLE_COBRANCA = "2026-10-26T03:00:00Z";
export const MOTIVO_ANTERIOR = "Anterior ao controle de cobrança (26/10/2026)";
export const ROBO_COBRANCA = "Robô de cobrança";
export const TIPOS_COBRAVEIS_SEM_OS = ["Peças", "Serviço de Terceiros"];
export const MOTIVO_MIN = 5;

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

export const reqCancelada = (r: ReqCobranca) => ["lixeira", "cancelar", "cancelada"].includes(String(r.status || "").trim().toLowerCase());
export const reqAlimentacao = (r: ReqCobranca) => /alimenta/i.test(String(r.tipo || ""));
/** Custo da própria loja, nunca cobrado do cliente mesmo com OS (José, 28/10/2026) */
export const TIPOS_CUSTO_LOJA = ["Veicular Abastecimento", "Veicular Manutenção"];
export const SETORES_CUSTO_LOJA = ["Trator-Loja"];
export const reqCustoDaLoja = (r: ReqCobranca) =>
  TIPOS_CUSTO_LOJA.includes(String(r.tipo || "").trim()) || SETORES_CUSTO_LOJA.includes(String(r.setor || "").trim());
/** OS de teste (Id_Ordem terminando em -T1/-T2/-T3): o robô nunca mexe */
export const ehOsTeste = (id: unknown) => /-T[123]$/i.test(String(id || "").trim());
export const temValorCobrado = (r: ReqCobranca) => !vazio(r.valor_cobrado_cliente);

/** Requisição que, pela natureza, tem de ser cobrada do cliente (independe de já ter valor). */
export function ehCobravel(r: ReqCobranca): boolean {
  if (reqCancelada(r) || reqAlimentacao(r) || reqCustoDaLoja(r)) return false;
  return !vazio(r.ordem_servico) || TIPOS_COBRAVEIS_SEM_OS.includes(String(r.tipo || "").trim());
}

/** Regra única do José: cobrável E ainda sem valor cobrado = deveria ser cobrada e não foi. */
export function deveSerCobrada(r: ReqCobranca): boolean {
  return ehCobravel(r) && !temValorCobrado(r);
}

/** cobrada (valor preenchido) · nao_cobrada (marcada com motivo) · a_cobrar (cobrável sem valor) · null (não se aplica) */
export function statusCobranca(r: ReqCobranca): CobrancaStatus | null {
  if (temValorCobrado(r)) return "cobrada";
  if (r.cobranca_status === "nao_cobrada") return "nao_cobrada";
  if (ehCobravel(r)) return "a_cobrar";
  return null;
}

export const criadaNoControle = (r: ReqCobranca) => !!r.created_at && new Date(r.created_at).getTime() >= new Date(INICIO_CONTROLE_COBRANCA).getTime();

/** Valor digitado ("1.234,56", "560.00", 80) → texto BR "1234,56" como o resto do portal grava; null se inválido */
export function valorCobradoTexto(v: unknown): string | null {
  if (vazio(v)) return null;
  const n = parseValorMisto(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2).replace(".", ",");
}

export const brl = (v: unknown) => parseValorMisto(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function textoLembreteCobranca(r: ReqCobranca): string {
  const os = vazio(r.ordem_servico) ? "" : `, ${String(r.ordem_servico).trim()}`;
  return `Cobrar do cliente: ${String(r.titulo || "requisição").trim()} (Req #${r.id}${os}) — custo ${brl(r.valor_despeza)}. Preencha o valor cobrado ou marque como não cobrada.`;
}
