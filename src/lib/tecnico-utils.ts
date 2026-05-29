/**
 * Utilitario centralizado para normalizacao e matching de nomes de tecnicos/usuarios.
 *
 * TODAS as comparacoes de nomes de tecnicos no portal devem usar estas funcoes,
 * garantindo que "Danilo" no Omie, POS, PPV, requisicoes, GPS, etc. seja sempre
 * reconhecido como o mesmo usuario.
 *
 * Usado por: /api/mecanicos, /api/painel-mecanicos, /api/pos/ordens/omie-sync,
 *            /lib/pos/omie, /lib/omie/matching, /public/mapa-geral/js/relatorio.js (manual)
 */

const DIACRITICS = /[\u0300-\u036f]/g;

// Prefixos de cargo que vem no nome (Omie / AppSheet)
const RE_PREFIXO_CARGO =
  /^(T[ÉE]CNICOS?(\s+EXTERNO)?|MEC[ÂA]NICOS?|MOTORISTAS?|VENDEDOR(ES)?|AUX(ILIARES)?|PECAS|PEÇAS)[:\s]+/i;

/**
 * Normaliza um nome para forma comparavel: sem acentos, lowercase, trim.
 * Nao remove prefixos — use `cleanName` para isso.
 */
export function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .trim();
}

/**
 * Limpa um nome cru para forma canonica (UPPER, sem acentos, sem prefixo de cargo,
 * sem conectivos, sem caracteres especiais).
 * Retorna null se for considerado "lixo" (muito curto ou marcador de sistema).
 */
export function cleanName(str: string | null | undefined): string | null {
  if (!str) return null;
  let s = String(str)
    .toUpperCase()
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .trim();
  s = s.replace(RE_PREFIXO_CARGO, "");
  s = s
    .replace(/\b(DE|DA|DO|DOS|DAS|E|OU|SR|SRA)\b/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  if (s.length < 3) return null;
  // Marcadores de sistema
  if (
    s.includes("FINALIZEI") ||
    s.includes("TRANSFERENCIA") ||
    s.includes("VIA API")
  )
    return null;

  return s;
}

/**
 * Extrai partes individuais de um nome composto de tecnicos.
 * Ex: "Técnicos: Danilo de Souza // José Oliveira" → ["Danilo de Souza", "José Oliveira"]
 */
export function splitTecnicos(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const sem = String(raw).replace(RE_PREFIXO_CARGO, "");
  return sem
    .split(/[/&]|\sE\s|\/\//)
    .map((p) => p.trim())
    .filter((p) => p.length > 2);
}

/**
 * Compara dois nomes ja normalizados (via normName ou cleanName).
 * Match exato OU bidirecional palavra-a-palavra com minimo 2 palavras
 * significativas em cada lado.
 *
 * Ex: "DANILO SOUZA" bate com "DANILO DE SOUZA"
 *     "PEDRO MOTTA" bate com "PEDRO HENRIQUE MOTTA"
 *     "DANILO" sozinho NAO bate com "DANILO SOUZA" (1 palavra < 2)
 */
export function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const palA = a.split(" ").filter((w) => w.length >= 3);
  const palB = b.split(" ").filter((w) => w.length >= 3);
  if (palA.length < 2 || palB.length < 2) return false;
  return (
    palA.every((w) => palB.includes(w)) || palB.every((w) => palA.includes(w))
  );
}

/**
 * Compara dois nomes crus (com acentos, prefixos, etc).
 * Limpa ambos com cleanName e depois compara com namesMatch.
 */
export function rawNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = cleanName(a);
  const cb = cleanName(b);
  if (!ca || !cb) return false;
  return namesMatch(ca, cb);
}

/**
 * Compara dois nomes usando normalizacao simples (lowercase, sem acentos).
 * Primeiro nome deve bater + pelo menos um sobrenome em comum.
 * Mais permissivo que namesMatch para nomes com apenas 1 parte.
 */
export function nomesBatem(a: string, b: string): boolean {
  if (!a || !b) return false;
  const pA = normName(a)
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((p) => p.length > 2);
  const pB = normName(b)
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((p) => p.length > 2);
  if (!pA.length || !pB.length || pA[0] !== pB[0]) return false;
  if (pA.length === 1 || pB.length === 1) return true;
  const s = new Set(pA.slice(1));
  return pB.slice(1).some((p) => s.has(p));
}

/**
 * Remove prefixos de cargo de um nome cru.
 * Ex: "Técnico: Danilo Souza" → "Danilo Souza"
 *     "Técnicos: A // B" → "A // B"
 */
export function removePrefixoCargo(nome: string): string {
  return nome.replace(RE_PREFIXO_CARGO, "").trim();
}

/**
 * Limpa nome de vendedor do Omie e retorna partes individuais.
 * Ex: "Técnicos: Danilo Souza // José Oliveira" → ["Danilo Souza", "José Oliveira"]
 */
export function limparNomeVendedor(nome: string): string[] {
  const semPrefixo = removePrefixoCargo(nome);
  return semPrefixo
    .split(/\s*\/\/\s*/)
    .map((n) => n.trim())
    .filter(Boolean);
}
