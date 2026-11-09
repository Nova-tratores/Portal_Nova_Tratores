// Controlador de fases do POS e do PPV (José, 09/11/2026: "adiciona um controlador de fases do pos e do ppv,
// onde o usuário consegue editar o nome, adicionar ou remover, e pergunta se quer aplicar a mudança no ppv também").
// Regras puras (testadas em __tests__/quadro.test.ts).
//
// - Cada quadro (pos | ppv) tem a SUA lista, em ordem. Sem lista salva = as fases de sempre (PHASES).
// - `chave` é o valor gravado na OS/PPV e NUNCA muda; renomear muda só o `rotulo` mostrado.
// - Fase nova: a chave é o nome digitado na criação (vira o Status das OS que forem para ela).
// - Fases que os robôs/faturamento gravam (FASES_FIXAS) não saem da lista: dá para renomear e mudar a ordem.
// - Remover só fase vazia (a rota confere no banco); OS com fase que não está na lista cai em "Outros".
import { PHASES } from "@/lib/pos/constants";

export type ModuloFases = "pos" | "ppv";
export interface FaseQuadro { chave: string; rotulo?: string }

/** Fases que o sistema grava sozinho (fase automática, app do técnico, faturamento, garantia, PPV). */
export const FASES_FIXAS: ReadonlySet<string> = new Set([
  "Orçamento",
  "Orçamento Aprovado",
  "Execução",
  "Executada",
  "Aguardando ordem Técnico",
  "Preenchido Paliativo",
  "Relatório Concluído",
  "Enviar Omie",
  "Enviado Para Omie",
  "Cobrando Cliente",
  "Preenchido Garantia",
  "Concluída",
  "Cancelada",
]);

/** Nomes que não podem virar fase nova (grupos virtuais do quadro). */
const RESERVADOS = new Set(["outros", "relatório concluído - garantia", "enviado omie"]);
export const MAX_NOME = 60;
export const MAX_FASES = 40;

const limpa = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const igual = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;

export function nomeDaFase(f: FaseQuadro): string {
  const r = limpa(f.rotulo);
  return r || f.chave;
}

export function listaPadrao(rotulos?: Record<string, string> | null): FaseQuadro[] {
  return PHASES.map((chave) => {
    const r = limpa(rotulos?.[chave]);
    return r && r !== chave ? { chave, rotulo: r } : { chave };
  });
}

/**
 * Lê o que veio do banco (ou de um PUT) e devolve uma lista válida: sem repetidas, sem vazias,
 * e com as FASES_FIXAS que faltarem de volta no lugar de sempre.
 */
export function normalizarLista(raw: unknown, rotulosAntigos?: Record<string, string> | null): FaseQuadro[] {
  if (!Array.isArray(raw) || raw.length === 0) return listaPadrao(rotulosAntigos);
  const out: FaseQuadro[] = [];
  const vistas = new Set<string>();
  for (const it of raw) {
    const chave = limpa((it as FaseQuadro)?.chave ?? it);
    if (!chave || chave.length > MAX_NOME || vistas.has(chave)) continue;
    vistas.add(chave);
    const rotulo = limpa((it as FaseQuadro)?.rotulo).slice(0, MAX_NOME);
    out.push(rotulo && rotulo !== chave ? { chave, rotulo } : { chave });
  }
  // fixas que sumiram voltam logo depois da fase padrão anterior que estiver na lista
  PHASES.forEach((chave, i) => {
    if (!FASES_FIXAS.has(chave) || vistas.has(chave)) return;
    let pos = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex((f) => f.chave === PHASES[j]);
      if (k !== -1) { pos = k + 1; break; }
    }
    out.splice(pos, 0, { chave });
    vistas.add(chave);
  });
  return out;
}

/** Erro do nome de uma fase NOVA (null = ok). */
export function validarNomeNovo(nome: string, lista: FaseQuadro[]): string | null {
  const n = limpa(nome);
  if (!n) return "Escreva o nome da fase.";
  if (n.length > MAX_NOME) return `Use no máximo ${MAX_NOME} letras.`;
  if (RESERVADOS.has(n.toLowerCase())) return "Esse nome é usado pelo quadro. Escolha outro.";
  if (lista.some((f) => igual(f.chave, n) || igual(nomeDaFase(f), n))) return "Já existe uma fase com esse nome.";
  if (lista.length >= MAX_FASES) return `No máximo ${MAX_FASES} fases.`;
  return null;
}

/** Erro do nome novo de uma fase que já existe (null = ok). Vazio = volta ao nome original. */
export function validarRenomear(chave: string, nome: string, lista: FaseQuadro[]): string | null {
  const n = limpa(nome);
  if (!n) return null;
  if (n.length > MAX_NOME) return `Use no máximo ${MAX_NOME} letras.`;
  if (lista.some((f) => f.chave !== chave && (igual(f.chave, n) || igual(nomeDaFase(f), n)))) return "Já existe uma fase com esse nome.";
  return null;
}

export function podeRemover(chave: string): boolean {
  return !FASES_FIXAS.has(chave);
}

/** Erro da lista inteira antes de salvar (null = ok). */
export function validarLista(lista: FaseQuadro[]): string | null {
  if (!lista.length) return "A lista ficou vazia.";
  if (lista.length > MAX_FASES) return `No máximo ${MAX_FASES} fases.`;
  const vistas = new Set<string>();
  const nomes: string[] = [];
  for (const f of lista) {
    if (!limpa(f.chave)) return "Tem fase sem nome.";
    if (vistas.has(f.chave)) return `A fase "${f.chave}" aparece duas vezes.`;
    vistas.add(f.chave);
    const n = nomeDaFase(f);
    if (n.length > MAX_NOME) return `"${n.slice(0, 20)}…" passou de ${MAX_NOME} letras.`;
    if (nomes.some((x) => igual(x, n))) return `Duas fases com o nome "${n}".`;
    nomes.push(n);
  }
  for (const k of FASES_FIXAS) if (!vistas.has(k)) return `A fase "${k}" é usada pelo sistema e não pode sair.`;
  return null;
}

// ───────── diferença entre antes/depois e aplicar no outro quadro ─────────

export interface Diferenca {
  renomeadas: { chave: string; rotulo: string }[]; // rotulo "" = voltou ao nome original
  adicionadas: { chave: string; rotulo?: string; depoisDe: string | null }[];
  removidas: string[];
  ordemMudou: boolean;
  /** ordem final das chaves (para levar a ordem ao outro quadro) */
  ordem: string[];
}

export function diferenca(antes: FaseQuadro[], depois: FaseQuadro[]): Diferenca {
  const mapaAntes = new Map(antes.map((f) => [f.chave, f]));
  const chavesDepois = new Set(depois.map((f) => f.chave));
  const renomeadas: Diferenca["renomeadas"] = [];
  const adicionadas: Diferenca["adicionadas"] = [];
  depois.forEach((f, i) => {
    const a = mapaAntes.get(f.chave);
    if (!a) { adicionadas.push({ chave: f.chave, rotulo: limpa(f.rotulo) || undefined, depoisDe: i > 0 ? depois[i - 1].chave : null }); return; }
    if (limpa(a.rotulo) !== limpa(f.rotulo)) renomeadas.push({ chave: f.chave, rotulo: limpa(f.rotulo) });
  });
  const removidas = antes.filter((f) => !chavesDepois.has(f.chave)).map((f) => f.chave);
  const comunsAntes = antes.filter((f) => chavesDepois.has(f.chave)).map((f) => f.chave);
  const comunsDepois = depois.filter((f) => mapaAntes.has(f.chave)).map((f) => f.chave);
  const ordemMudou = comunsAntes.join("\u0001") !== comunsDepois.join("\u0001");
  return { renomeadas, adicionadas, removidas, ordemMudou, ordem: depois.map((f) => f.chave) };
}

export function temMudanca(d: Diferenca): boolean {
  return d.renomeadas.length > 0 || d.adicionadas.length > 0 || d.removidas.length > 0 || d.ordemMudou;
}

/** Frases curtas do que mudou ("Renomeada: A → B", …) para mostrar antes de salvar. */
export function resumoDiferenca(d: Diferenca, antes: FaseQuadro[]): string[] {
  const nomeAntes = (k: string) => { const f = antes.find((x) => x.chave === k); return f ? nomeDaFase(f) : k; };
  const out: string[] = [];
  for (const a of d.adicionadas) out.push(`Nova: ${a.rotulo || a.chave}`);
  for (const r of d.renomeadas) out.push(`Nome: ${nomeAntes(r.chave)} → ${r.rotulo || r.chave}`);
  for (const k of d.removidas) out.push(`Removida: ${nomeAntes(k)}`);
  if (d.ordemMudou) out.push("Ordem das fases mudou");
  return out;
}

/**
 * Leva as mudanças de um quadro para o outro: renomeia/remove o que existir lá, insere as novas
 * depois da mesma vizinha (ou antes de Concluída) e, se a ordem mudou, reordena as fases em comum
 * mantendo as que só existem lá no lugar delas. Fixas nunca saem.
 */
export function aplicarDiferenca(lista: FaseQuadro[], d: Diferenca): FaseQuadro[] {
  let out = lista.map((f) => ({ ...f }));
  for (const r of d.renomeadas) {
    const f = out.find((x) => x.chave === r.chave);
    if (!f) continue;
    if (r.rotulo && r.rotulo !== f.chave) f.rotulo = r.rotulo; else delete f.rotulo;
  }
  out = out.filter((f) => !d.removidas.includes(f.chave) || FASES_FIXAS.has(f.chave));
  for (const a of d.adicionadas) {
    if (out.some((f) => f.chave === a.chave)) continue;
    const nova: FaseQuadro = a.rotulo && a.rotulo !== a.chave ? { chave: a.chave, rotulo: a.rotulo } : { chave: a.chave };
    let pos = a.depoisDe === null ? 0 : out.findIndex((f) => f.chave === a.depoisDe) + 1;
    if (a.depoisDe !== null && pos === 0) {
      const conc = out.findIndex((f) => f.chave === "Concluída");
      pos = conc === -1 ? out.length : conc;
    }
    out.splice(pos, 0, nova);
  }
  if (d.ordemMudou) {
    const idx = new Map(d.ordem.map((k, i) => [k, i]));
    const slots: number[] = [];
    out.forEach((f, i) => { if (idx.has(f.chave)) slots.push(i); });
    const comuns = slots.map((i) => out[i]).sort((a, b) => idx.get(a.chave)! - idx.get(b.chave)!);
    slots.forEach((s, j) => { out[s] = comuns[j]; });
  }
  return out;
}

/** Quem pode mexer nas fases: pós-vendas (categoria ou módulo pos), admin ou dev. */
export { podeRenomearFases as podeEditarFases } from "./fases";
