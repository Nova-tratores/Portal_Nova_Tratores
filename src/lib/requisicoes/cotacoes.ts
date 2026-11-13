// Mapa de cotações da requisição (req_cotacao, colunas largas 1..5).
// Regras puras: indicada × comprada, remoção com deslocamento, link seguro.
// (12/11/2026 — pedido: quem monta indica, quem lança a nota marca a comprada,
// para depois medir se a indicação é boa e se a compra segue a indicação.)
// Mesma lista de CAMPOS_NF (anexos.ts) — copiada porque anexos.ts carrega o supabase.
const CAMPOS_NF = ['foto_nf', 'foto_nf2', 'foto_nf3', 'foto_nf4', 'foto_nf5'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- colunas largas legadas (fornecedor1..5 etc.)
export type Cotacao = Record<string, any>;

export const MAX_COTACOES = 5;

/** Campos por fornecedor que andam juntos quando uma cotação é removida. */
export const CAMPOS_POR_COTACAO = ['fornecedor', 'servico_material', 'valor', 'obs', 'anexo', 'link'] as const;

/** Colunas criadas por sql/req-cotacao-escolhas.sql (o save tenta de novo sem elas). */
export const COLUNAS_NOVAS_COTACAO = [
  'link1', 'link2', 'link3', 'link4', 'link5',
  'indicada', 'indicada_por', 'indicada_em', 'comprada', 'comprada_por', 'comprada_em',
] as const;

const temTexto = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '';

/** Nºs (1..5) das cotações com fornecedor ou valor preenchido. */
export function cotacoesPreenchidas(cot: Cotacao | null | undefined): number[] {
  if (!cot) return [];
  const out: number[] = [];
  for (let i = 1; i <= MAX_COTACOES; i++) {
    if (temTexto(cot[`fornecedor${i}`]) || temTexto(cot[`valor${i}`])) out.push(i);
  }
  return out;
}

function ajustarIndice(v: unknown, removido: number): number | null {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) return null;
  if (n === removido) return null;
  return n > removido ? n - 1 : n;
}

/** Remove a cotação `idx` e puxa as de baixo uma casa; indicada/comprada acompanham. */
export function removerCotacaoShift(cot: Cotacao, idx: number): Cotacao {
  const novo: Cotacao = { ...cot };
  for (let j = idx; j < MAX_COTACOES; j++) {
    for (const c of CAMPOS_POR_COTACAO) {
      const vazio = c === 'anexo' || c === 'link' ? null : '';
      novo[`${c}${j}`] = cot[`${c}${j + 1}`] ?? vazio;
    }
  }
  for (const c of CAMPOS_POR_COTACAO) novo[`${c}${MAX_COTACOES}`] = c === 'anexo' || c === 'link' ? null : '';
  if ('indicada' in cot) {
    novo.indicada = ajustarIndice(cot.indicada, idx);
    if (novo.indicada === null) { novo.indicada_por = null; novo.indicada_em = null; }
  }
  if ('comprada' in cot) {
    novo.comprada = ajustarIndice(cot.comprada, idx);
    if (novo.comprada === null) { novo.comprada_por = null; novo.comprada_em = null; }
  }
  return novo;
}

/** Tem nota anexada, 2+ cotações e ninguém marcou qual foi comprada. */
export function precisaMarcarComprada(cot: Cotacao | null | undefined, req: Record<string, unknown>): boolean {
  if (!cot || cot.comprada) return false;
  const temNota = CAMPOS_NF.some((c) => temTexto(req?.[c]));
  return temNota && cotacoesPreenchidas(cot).length >= 2;
}

export type Aderencia = 'seguiu' | 'outra' | 'sem_indicada' | 'sem_comprada';

/** A compra seguiu a indicação? (base do relatório futuro) */
export function aderencia(cot: Cotacao | null | undefined): Aderencia {
  if (!cot?.comprada) return 'sem_comprada';
  if (!cot.indicada) return 'sem_indicada';
  return Number(cot.indicada) === Number(cot.comprada) ? 'seguiu' : 'outra';
}

/** Link clicável: só http(s); sem esquema ganha https://. Inválido → null. */
export function linkSeguro(url: unknown): string | null {
  let s = String(url ?? '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** "https://www.loja.com.br/p/123" → "loja.com.br" (para o PDF). */
export function dominioDoLink(url: unknown): string {
  const s = linkSeguro(url);
  if (!s) return '';
  try { return new URL(s).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** Erro de coluna inexistente (migration ainda não aplicada). */
export function erroColunaFaltando(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === '42703' || err.code === 'PGRST204' || /column .* does not exist|Could not find the .* column/i.test(err.message || '');
}

export function semColunasNovas(cot: Cotacao): Cotacao {
  const out: Cotacao = { ...cot };
  for (const c of COLUNAS_NOVAS_COTACAO) delete out[c];
  return out;
}
