// =============================================================================
// Modo sombra das permissões v2 — regras PURAS (sem banco).
//
// Traduz cada checagem que as rotas fazem hoje para a(s) tela(s) da v2 e decide
// com o conjunto de telas efetivas do usuário (perm_efetivas). O servidor
// (sombra-server.ts) compara com o resultado antigo e agrega as divergências.
// =============================================================================

export type Checagem =
  /** exigirPermissao(modulo, acao?) */
  | { tipo: 'permissao'; modulo: string; acao?: string }
  /** exigirAcessoModulo(modulo) */
  | { tipo: 'modulo'; modulo: string }
  /** protegerRota(opcoes) — basta uma passar */
  | { tipo: 'rota'; opcoes: ({ modulo: string; acao?: string } | { admin: true })[] };

export type ModoV2 = 'off' | 'sombra' | 'on';

export function modoV2(valor: string | undefined): ModoV2 {
  const v = (valor || '').trim().toLowerCase();
  // Padrão desde 30/10/2026: a v2 decide (aprovado pelo José após 54 mil checagens na sombra).
  return v === 'sombra' || v === 'off' ? v : 'on';
}

/** Telas da v2 que respondem por uma checagem (para registrar e conferir catálogo). */
export function telasDaChecagem(c: Checagem): string[] {
  if (c.tipo === 'modulo') return [c.modulo];
  if (c.tipo === 'permissao') return [c.acao ? `${c.modulo}:${c.acao}` : c.modulo];
  return c.opcoes.map((o) => ('admin' in o ? '@admin' : o.acao ? `${o.modulo}:${o.acao}` : o.modulo));
}

/** Decisão da v2: `efetivas` = ids de telas que o usuário tem (nível ≥ ver). */
export function decidirV2(c: Checagem, efetivas: ReadonlySet<string>, ehAdmin: boolean): boolean {
  if (c.tipo === 'rota') {
    return c.opcoes.some((o) => ('admin' in o ? ehAdmin : efetivas.has(o.acao ? `${o.modulo}:${o.acao}` : o.modulo)));
  }
  return telasDaChecagem(c).some((t) => efetivas.has(t));
}

/** Rótulo único da checagem (vai em tela_id da perm_sombra). */
export function rotuloChecagem(c: Checagem): string {
  return telasDaChecagem(c).join('|');
}

export interface ItemSombra {
  dia: string; user_id: string; tela_id: string; rota: string;
  antigo: boolean; v2: boolean; catalogada: boolean; decidiu: 'antigo' | 'v2';
}

export const chaveItem = (i: ItemSombra) =>
  [i.dia, i.user_id, i.tela_id, i.rota, i.antigo, i.v2, i.decidiu].join('\u0001');

/** Junta itens iguais somando `vezes`. */
export function agregar(itens: (ItemSombra & { vezes?: number })[]): (ItemSombra & { vezes: number })[] {
  const m = new Map<string, ItemSombra & { vezes: number }>();
  for (const i of itens) {
    const k = chaveItem(i);
    const atual = m.get(k);
    if (atual) atual.vezes += i.vezes ?? 1;
    else m.set(k, { ...i, vezes: i.vezes ?? 1 });
  }
  return [...m.values()];
}
