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
