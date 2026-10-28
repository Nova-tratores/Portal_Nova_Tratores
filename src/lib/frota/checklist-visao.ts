// Visualizador do checklist mensal (José, 22/10/2026): resumo, filtros
// (tudo · só pendências · sem foto · por categoria) e o mesmo item no mês anterior.
// Puro: a tela (components/frota/novo/ChecklistViewer.tsx) só desenha.
import { CHECKLIST_ITEMS } from './checklist';
import { resumoAnalise, type AnalisePneu } from './pneu-regras';

export interface ItemVisao {
  id: string;
  item_key: string | null;
  categoria: string | null;
  titulo: string | null;
  resposta: string | null;
  observacao: string | null;
  foto_url: string | null;
  respondido_em: string | null;
  ia_analise?: AnalisePneu | null;
}

export type FiltroChecklist = 'tudo' | 'pendencias' | 'sem_foto' | `cat:${string}`;

const ORDEM = new Map(CHECKLIST_ITEMS.map((d, i) => [d.key, i]));
const DEF = new Map(CHECKLIST_ITEMS.map((d) => [d.key, d]));

/** problema na resposta OU a IA disse que a foto do pneu não comprova */
export function ehPendencia(i: ItemVisao): boolean {
  return i.resposta === 'problema' || i.ia_analise?.comprova === false;
}

export function categoriaDe(i: ItemVisao): string {
  return i.categoria || DEF.get(i.item_key || '')?.cat || 'Outros';
}

export function tituloDe(i: ItemVisao): string {
  return i.titulo || DEF.get(i.item_key || '')?.titulo || i.item_key || 'Item';
}

/** na ordem do checklist (a mesma do app do técnico) */
export function ordenarItens<T extends ItemVisao>(itens: T[]): T[] {
  return [...itens].sort((a, b) => (ORDEM.get(a.item_key || '') ?? 999) - (ORDEM.get(b.item_key || '') ?? 999));
}

export function resumoChecklist(itens: ItemVisao[]) {
  const respondidos = itens.filter((i) => i.resposta);
  return {
    total: CHECKLIST_ITEMS.length,
    respondidos: respondidos.length,
    ok: respondidos.filter((i) => !ehPendencia(i)).length,
    pendencias: itens.filter(ehPendencia).length,
    semFoto: itens.filter((i) => !i.foto_url).length,
    faltando: CHECKLIST_ITEMS.filter((d) => !itens.some((i) => i.item_key === d.key)).map((d) => d.titulo),
  };
}

export function categorias(itens: ItemVisao[]): { nome: string; qtd: number; pendencias: number }[] {
  const m = new Map<string, { qtd: number; pendencias: number }>();
  for (const i of ordenarItens(itens)) {
    const c = categoriaDe(i);
    const a = m.get(c) || { qtd: 0, pendencias: 0 };
    a.qtd++; if (ehPendencia(i)) a.pendencias++;
    m.set(c, a);
  }
  return [...m.entries()].map(([nome, v]) => ({ nome, ...v }));
}

export function filtrarItens<T extends ItemVisao>(itens: T[], filtro: FiltroChecklist): T[] {
  const ord = ordenarItens(itens);
  if (filtro === 'pendencias') return ord.filter(ehPendencia);
  if (filtro === 'sem_foto') return ord.filter((i) => !i.foto_url);
  if (filtro.startsWith('cat:')) return ord.filter((i) => categoriaDe(i) === filtro.slice(4));
  return ord;
}

/** o mesmo item (pela chave) no checklist anterior, para comparar as fotos */
export function itemAnterior<T extends ItemVisao>(item: ItemVisao, anteriores: T[]): T | null {
  if (!item.item_key) return null;
  return anteriores.find((a) => a.item_key === item.item_key) || null;
}

export function textoIA(i: ItemVisao): string {
  return resumoAnalise(i.ia_analise);
}

/** alertas do score vêm como JSON string do banco */
export function lerAlertas(s: string | null | undefined): string[] {
  if (!s) return [];
  try { const a = JSON.parse(s); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
}
