// Utilidades de texto compartilhadas (client-safe, sem dependências).

// Nome de pessoa em Title Case BR: "NICOLAS DARIO" e "Nicolas Dario" viram a
// MESMA string ("Nicolas Dario") — fontes diferentes (CSV da operadora,
// digitação, apps) alternam a caixa e a mesma pessoa vira duas em filtros e
// rankings. Preposições (de/da/do...) ficam minúsculas, menos no início.
const PREPOSICOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du']);

export function normalizarNomePessoa(nome: string | null | undefined): string | null {
  const limpo = String(nome ?? '').trim().replace(/\s+/g, ' ');
  if (!limpo) return null;
  return limpo
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && PREPOSICOES.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

// Busca sem diferença de maiúscula/minúscula NEM de acento: "jose" acha
// "José", "os-0777" acha "OS-0777", "orcamento" acha "Orçamento".
export function paraBusca(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Conta de teste: some de todo seletor de pessoa, mas continua existindo para
// testar o portal. Vale a coluna financeiro_usu.teste (sql/usuarios-teste.sql).
// Enquanto a coluna não existe (teste === undefined), cai no jeito antigo:
// "teste" como palavra no nome ou na função ("Mecânico Teste", "VENDEDOR TESTE 2").
export function ehContaTeste(u: { nome?: string | null; funcao?: string | null; teste?: boolean | null }): boolean {
  if (typeof u.teste === 'boolean') return u.teste;
  return /\bteste\b/.test(paraBusca(u.nome)) || /\bteste\b/.test(paraBusca(u.funcao));
}

// true se algum dos textos contém a busca (vazia = casa tudo).
export function casaBusca(busca: string, ...textos: unknown[]): boolean {
  const q = paraBusca(busca).trim();
  if (!q) return true;
  return textos.some((t) => paraBusca(t).includes(q));
}
