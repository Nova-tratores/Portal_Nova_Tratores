// Um período de responsável em `frota_responsaveis` com `fim: null` significa
// "responsável atual". Mas às vezes o desvincular foi feito digitando um nome
// placeholder ("Vazio", "sem responsável", "-") em vez de deixar em branco —
// nesse caso o carro está, na prática, SEM responsável. Este helper reconhece
// esses nomes para que o veículo volte a contar como não-vinculado (aparece no
// checklist mensal e no botão "Checklist do mês").
export function responsavelVazio(nome?: string | null): boolean {
  const s = String(nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (!s) return true;
  return [
    'vazio', 'sem responsavel', 'sem resp', 'sem motorista',
    'nenhum', 'n/a', 'na', '-', '--', '---', 'x', '.',
  ].includes(s);
}

// Palavras que não ajudam a identificar a pessoa (preposições dos nomes).
const CONECTIVOS = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);

function tokensDoNome(n?: string | null): string[] {
  return String(n || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !CONECTIVOS.has(t));
}

// Mesmo nome de pessoa, tolerante a variações ("Danilo de Souza" × "DANILO
// SOUZA", acentos, maiúsculas). Regra: TODOS os tokens do nome mais curto
// aparecem no mais longo E há pelo menos 2 tokens em comum (evita casar só pelo
// primeiro nome, tipo dois "Danilo" diferentes).
export function mesmaPessoa(a?: string | null, b?: string | null): boolean {
  const ta = tokensDoNome(a);
  const tb = tokensDoNome(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [menor, maior] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const setMaior = new Set(maior);
  const comuns = menor.filter((t) => setMaior.has(t)).length;
  return comuns === menor.length && comuns >= 2;
}
