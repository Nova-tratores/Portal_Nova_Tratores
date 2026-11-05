// TREINAMENTO (LMS) — regras. PURO (sem I/O), client-safe.
//
// Uma trilha = artigos publicados da base de conhecimento, em ordem, + prova de
// múltipla escolha. A pessoa lê cada artigo ("Li e entendi"), faz a prova e
// conclui quando passa na nota mínima. Prazo e nota vêm da trilha.

export type StatusTrilha = "rascunho" | "ativa" | "arquivada";
export type SituacaoBanco = "pendente" | "em_andamento" | "concluida";
/** Situação como a tela mostra: `vencida` é calculada (prazo passou e não concluiu). */
export type Situacao = SituacaoBanco | "vencida";
export type OrigemAtribuicao = "categoria" | "manual" | "reciclagem";

export interface Trilha {
  id: string; titulo: string; descricao: string | null; modulo: string; publico: string[];
  obrigatoria: boolean; nota_minima: number; prazo_dias: number; status: StatusTrilha;
  criado_por_nome: string | null; criado_em: string; atualizado_em: string;
}
export interface Etapa { id: string; trilha_id: string; ordem: number; artigo_id: string }
export interface Pergunta { id: string; trilha_id: string; artigo_id: string | null; ordem: number; enunciado: string; opcoes: string[]; correta: number; explicacao: string | null; ativa: boolean }
export interface Atribuicao {
  id: string; trilha_id: string; user_id: string; user_nome: string | null; ciclo: number; origem: OrigemAtribuicao;
  etapas: string[] | null; prazo: string; situacao: SituacaoBanco; nota: number | null; tentativas: number; concluida_em: string | null; motivo: string | null; criado_em: string;
}

export const NOTA_MINIMA_PADRAO = 70;
export const PRAZO_DIAS_PADRAO = 7;
export const LIMITES = { opcoes: { min: 2, max: 6 }, perguntasMin: 1, enunciado: 500, opcao: 300, titulo: 120, descricao: 1000 };

// -----------------------------------------------------------------------------
// Datas (dia local YYYY-MM-DD)
// -----------------------------------------------------------------------------
export function dataLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function somarDias(diaISO: string, dias: number): string {
  const [a, m, d] = diaISO.split("-").map(Number);
  return dataLocal(new Date(a, m - 1, d + dias));
}
export function prazoDaTrilha(t: Pick<Trilha, "prazo_dias">, hoje: Date = new Date()): string {
  return somarDias(dataLocal(hoje), t.prazo_dias);
}
/** Dias até o prazo (negativo = passou). */
export function diasParaPrazo(prazo: string, hoje: string): number {
  const [a1, m1, d1] = prazo.split("-").map(Number), [a2, m2, d2] = hoje.split("-").map(Number);
  return Math.round((Date.UTC(a1, m1 - 1, d1) - Date.UTC(a2, m2 - 1, d2)) / 86400000);
}

export function situacaoEfetiva(a: Pick<Atribuicao, "situacao" | "prazo">, hoje: string): Situacao {
  if (a.situacao === "concluida") return "concluida";
  return a.prazo < hoje ? "vencida" : a.situacao;
}

export const SITUACAO_ROTULO: Record<Situacao, { rotulo: string; cor: string; icone: string }> = {
  pendente: { rotulo: "Não começou", cor: "#64748b", icone: "fa-circle" },
  em_andamento: { rotulo: "Em andamento", cor: "#2563eb", icone: "fa-circle-half-stroke" },
  concluida: { rotulo: "Concluída", cor: "#15803d", icone: "fa-circle-check" },
  vencida: { rotulo: "Atrasada", cor: "#dc2626", icone: "fa-circle-exclamation" },
};

// -----------------------------------------------------------------------------
// Etapas que valem para a atribuição e progresso
// -----------------------------------------------------------------------------
/** Reciclagem restringe as etapas; ciclo 1 = todas. Mantém a ordem da trilha. */
export function etapasDaAtribuicao(etapas: Etapa[], a: Pick<Atribuicao, "etapas">): Etapa[] {
  const ord = [...etapas].sort((x, y) => x.ordem - y.ordem);
  if (!a.etapas || a.etapas.length === 0) return ord;
  const set = new Set(a.etapas);
  return ord.filter((e) => set.has(e.id));
}

export interface Progresso { lidas: number; total: number; pct: number; proxima: Etapa | null; faltaProva: boolean; temProva: boolean }

export function progresso(etapas: Etapa[], lidasIds: Set<string>, temProva: boolean, aprovado: boolean): Progresso {
  const total = etapas.length;
  const lidas = etapas.filter((e) => lidasIds.has(e.id)).length;
  const proxima = etapas.find((e) => !lidasIds.has(e.id)) ?? null;
  const passos = total + (temProva ? 1 : 0);
  const feitos = lidas + (temProva && aprovado ? 1 : 0);
  return { lidas, total, pct: passos ? Math.round((feitos / passos) * 100) : 0, proxima, faltaProva: temProva && !aprovado, temProva };
}

/** Pode fazer a prova quando leu todos os artigos da atribuição. */
export function podeFazerProva(p: Progresso): boolean {
  return p.total === 0 || p.lidas === p.total;
}

// -----------------------------------------------------------------------------
// Prova
// -----------------------------------------------------------------------------
export interface Correcao { acertos: number; total: number; nota: number; aprovado: boolean; erradas: string[]; semResposta: string[] }

/** Perguntas da prova para a atribuição: na reciclagem, só as dos artigos que mudaram (se houver alguma; senão todas). */
export function perguntasDaAtribuicao(perguntas: Pergunta[], etapas: Etapa[], a: Pick<Atribuicao, "etapas">): Pergunta[] {
  const ativas = perguntas.filter((p) => p.ativa).sort((x, y) => x.ordem - y.ordem);
  if (!a.etapas || a.etapas.length === 0) return ativas;
  const artigos = new Set(etapasDaAtribuicao(etapas, a).map((e) => e.artigo_id));
  const soDoQueMudou = ativas.filter((p) => p.artigo_id && artigos.has(p.artigo_id));
  return soDoQueMudou.length ? soDoQueMudou : ativas;
}

export function corrigir(perguntas: Pergunta[], respostas: Record<string, unknown>, notaMinima: number): Correcao {
  const erradas: string[] = [], semResposta: string[] = [];
  let acertos = 0;
  for (const p of perguntas) {
    const r = respostas[p.id];
    if (typeof r !== "number" || !Number.isInteger(r)) { semResposta.push(p.id); continue; }
    if (r === p.correta) acertos++; else erradas.push(p.id);
  }
  const total = perguntas.length;
  const nota = total ? Math.round((acertos / total) * 100) : 100;
  return { acertos, total, nota, aprovado: nota >= notaMinima, erradas, semResposta };
}

/** A prova é a mesma para todos; embaralhar a ORDEM das perguntas por pessoa evita cola de ombro sem mudar o gabarito. */
export function embaralharDeterministico<T>(itens: T[], semente: string): T[] {
  let h = 2166136261;
  for (const ch of semente) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const out = [...itens];
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// -----------------------------------------------------------------------------
// Validação do que vem do editor / da IA
// -----------------------------------------------------------------------------
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function validarPergunta(e: unknown): { pergunta: Omit<Pergunta, "id" | "trilha_id">; erros: string[] } {
  const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
  const enunciado = str(o.enunciado, LIMITES.enunciado);
  const opcoes = (Array.isArray(o.opcoes) ? o.opcoes : []).map((x) => str(x, LIMITES.opcao)).filter(Boolean).slice(0, LIMITES.opcoes.max);
  const correta = Number.isInteger(Number(o.correta)) ? Number(o.correta) : -1;
  const erros: string[] = [];
  if (enunciado.length < 5) erros.push("Pergunta muito curta.");
  if (opcoes.length < LIMITES.opcoes.min) erros.push("Cada pergunta precisa de pelo menos 2 opções.");
  if (correta < 0 || correta >= opcoes.length) erros.push("Marque qual opção é a certa.");
  if (new Set(opcoes.map((x) => x.toLowerCase())).size !== opcoes.length) erros.push("Há opções repetidas.");
  return {
    pergunta: {
      enunciado, opcoes, correta: Math.max(0, correta),
      explicacao: str(o.explicacao, LIMITES.enunciado) || null,
      artigo_id: typeof o.artigo_id === "string" && o.artigo_id ? o.artigo_id : null,
      ordem: Number.isFinite(Number(o.ordem)) ? Number(o.ordem) : 0,
      ativa: o.ativa !== false,
    },
    erros,
  };
}

export interface TrilhaEntrada { titulo: string; descricao: string | null; modulo: string; publico: string[]; obrigatoria: boolean; nota_minima: number; prazo_dias: number; etapas: string[] }

export function validarTrilha(e: unknown): { trilha: TrilhaEntrada; erros: string[] } {
  const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
  const titulo = str(o.titulo, LIMITES.titulo);
  const modulo = str(o.modulo, 40);
  const n = (v: unknown, pad: number, min: number, max: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x))) : pad; };
  const lista = (v: unknown) => Array.from(new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim())));
  const erros: string[] = [];
  if (titulo.length < 3) erros.push("Título com pelo menos 3 letras.");
  if (!modulo) erros.push("Escolha o módulo da trilha.");
  const etapas = lista(o.etapas);
  if (etapas.length === 0) erros.push("Escolha pelo menos um artigo publicado para a trilha.");
  return {
    trilha: {
      titulo, descricao: str(o.descricao, LIMITES.descricao) || null, modulo, publico: lista(o.publico),
      obrigatoria: o.obrigatoria !== false, nota_minima: n(o.nota_minima, NOTA_MINIMA_PADRAO, 0, 100), prazo_dias: n(o.prazo_dias, PRAZO_DIAS_PADRAO, 1, 365), etapas,
    },
    erros,
  };
}

// -----------------------------------------------------------------------------
// Quem recebe a trilha sozinho / painel
// -----------------------------------------------------------------------------
export function recebeSozinho(t: Pick<Trilha, "status" | "publico">, categoria: string | null | undefined): boolean {
  return t.status === "ativa" && !!categoria && t.publico.includes(categoria);
}

export interface LinhaPainel { atribuicao: Atribuicao; situacao: Situacao; dias: number; pct: number }

export function resumoPainel(linhas: LinhaPainel[]): { total: number; concluidas: number; atrasadas: number; emAndamento: number; pendentes: number; notaMedia: number | null } {
  const notas = linhas.map((l) => l.atribuicao.nota).filter((n): n is number => typeof n === "number");
  return {
    total: linhas.length,
    concluidas: linhas.filter((l) => l.situacao === "concluida").length,
    atrasadas: linhas.filter((l) => l.situacao === "vencida").length,
    emAndamento: linhas.filter((l) => l.situacao === "em_andamento").length,
    pendentes: linhas.filter((l) => l.situacao === "pendente").length,
    notaMedia: notas.length ? Math.round(notas.reduce((s, n) => s + n, 0) / notas.length) : null,
  };
}
