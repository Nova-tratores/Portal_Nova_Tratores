// =============================================================================
// INTELIGÊNCIA DE VENDAS — Plano Safra semiautomático. Lib PURA.
//
// O robô baixa as páginas oficiais do BNDES, guarda só o TRECHO DAS CONDIÇÕES
// (taxa, prazo, carência, participação, limite, para quem, o que financia) e
// compara com a última leitura. Se mudou, a IA propõe os números e uma pessoa
// confere. Aqui ficam as partes sem rede: quais páginas, como achar o trecho,
// como validar o que a IA devolveu.
// =============================================================================

export interface FontePlanoSafra { programa: string; nome: string; url: string }

export const FONTES_PLANO_SAFRA: FontePlanoSafra[] = [
  { programa: 'moderfrota', nome: 'Moderfrota (BNDES)', url: 'https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/moderfrota' },
  { programa: 'pronaf', nome: 'Pronaf Mais Alimentos (BNDES)', url: 'https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/pronaf-mais-alimentos' },
  { programa: 'pronamp', nome: 'Pronamp Investimento (BNDES)', url: 'https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/pronamp-investimento' },
  { programa: 'inovagro', nome: 'Inovagro (BNDES)', url: 'https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/inovagro' },
];

const PALAVRAS = /(taxa|juros|ao ano|prazo|car[eê]ncia|participa[cç][aã]o|limite|financi[aá]ve|benefici[aá]ri|quem pode|receita bruta|aquisi[cç][aã]o de (tratores|m[aá]quinas)|vig[eê]ncia|safra|\d+\s*(anos|meses)|at[eé] \d)/i;

/** HTML → só as frases das condições (normalizadas: o hash não muda por espaço ou menu). */
export function extrairCondicoes(html: string): string {
  const texto = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<\/(p|li|h\d|tr|td|th|div|br|section|article|header|footer|ul|ol)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ');
  const linhas = texto.split('\n').map((l) => l.trim()).filter((l) => l.length > 3 && l.length < 600);
  const out: string[] = [];
  for (const l of linhas) if (PALAVRAS.test(l) && !out.includes(l)) out.push(l);
  return out.join('\n').slice(0, 8000);
}

/** Hash simples e estável (FNV-1a 32 bits) — só para saber se o trecho mudou. */
export function hashTexto(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface LinhaProposta {
  nome: string; taxa_aa: number | null; taxa_aa_max: number | null; prazo_anos: number | null; carencia_meses: number | null;
  participacao_pct: number | null; limite: string | null; publico: string | null; financia: string | null; observacao: string | null;
}

const num = (v: unknown, min: number, max: number): number | null => {
  if (v == null || String(v).trim() === '') return null; // não informado ≠ zero
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace('%', '').replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
};
const txt = (v: unknown, max = 400): string | null => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Valida o JSON que a IA devolveu: só aceita números plausíveis (taxa 0–30% a.a.,
 * prazo até 20 anos, carência até 60 meses). Linha sem nome ou sem nenhuma condição
 * numérica é descartada — melhor nada do que número inventado.
 */
export function validarLinhas(json: unknown): LinhaProposta[] {
  const arr = Array.isArray(json) ? json : Array.isArray((json as { linhas?: unknown })?.linhas) ? (json as { linhas: unknown[] }).linhas : [];
  const out: LinhaProposta[] = [];
  for (const x of arr as Record<string, unknown>[]) {
    const l: LinhaProposta = {
      nome: txt(x?.nome, 160) || '',
      taxa_aa: num(x?.taxa_aa, 0, 30), taxa_aa_max: num(x?.taxa_aa_max, 0, 30),
      prazo_anos: num(x?.prazo_anos, 0.5, 20), carencia_meses: num(x?.carencia_meses, 0, 60),
      participacao_pct: num(x?.participacao_pct, 1, 100),
      limite: txt(x?.limite), publico: txt(x?.publico), financia: txt(x?.financia), observacao: txt(x?.observacao),
    };
    if (l.taxa_aa != null && l.taxa_aa_max != null && l.taxa_aa_max < l.taxa_aa) [l.taxa_aa, l.taxa_aa_max] = [l.taxa_aa_max, l.taxa_aa];
    if (!l.nome || (l.taxa_aa == null && l.prazo_anos == null)) continue;
    // a IA às vezes repete a mesma linha
    if (out.some((o) => o.nome === l.nome && o.taxa_aa === l.taxa_aa && o.prazo_anos === l.prazo_anos)) continue;
    out.push(l);
  }
  return out.slice(0, 12);
}

/** Safra corrente pelo calendário do Plano Safra (julho a junho). */
export function safraAtual(hojeISO: string): string {
  const a = Number(hojeISO.slice(0, 4)), m = Number(hojeISO.slice(5, 7));
  const ini = m >= 7 ? a : a - 1;
  return `${ini}/${String(ini + 1).slice(2)}`;
}

export const PROMPT_IA = `Você lê o texto oficial de uma linha de crédito rural do BNDES e extrai as CONDIÇÕES.
Responda SÓ um JSON: {"linhas":[{"nome":"","taxa_aa":0,"taxa_aa_max":null,"prazo_anos":0,"carencia_meses":0,"participacao_pct":null,"limite":"","publico":"","financia":"","observacao":""}]}
Regras: uma linha por condição diferente (ex.: faixas de receita ou de finalidade com taxa diferente);
taxa em % ao ano (número); prazo em anos; carência em meses; NÃO invente: campo que não está no texto = null.
Inclua toda linha que sirva para comprar trator, implemento, máquinas e equipamentos agrícolas
(inclusive "máquinas e equipamentos" em geral e agricultura de precisão). Ignore só o que for EXCLUSIVO de
pesca, aquicultura, armazenagem, irrigação, energia ou construções.
O "nome" deve dizer a faixa ou o público (ex.: "Moderfrota — receita bruta até R$ 45 milhões").`;

/**
 * A linha serve para vender máquina? O BNDES mistura no mesmo programa linhas de gado,
 * aves, irrigação etc. (o Pronamp trouxe "avicultura caipira" e "bovinos e bubalinos").
 * Fica de fora o que é claramente de outra finalidade e não cita máquina.
 */
export function linhaServeMaquina(l: { nome?: string | null; financia?: string | null; publico?: string | null }): boolean {
  const t = `${l.nome || ''} ${l.financia || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/maquin|equipament|trator|implement|mecaniz|colheitadeira|plantadeira|pulverizador|agricultura de precisao/.test(t)) return true;
  return !/bovino|bubalino|avicultura|aves\b|suin|pesca|aquicultura|irrigac|armazen|reten[cç]ao de matrizes|recria|engorda|correcao de solo|calcario|reflorest|energia/.test(t);
}
