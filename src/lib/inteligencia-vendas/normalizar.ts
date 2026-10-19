// =============================================================================
// INTELIGÊNCIA DE VENDAS — normalização das chaves de cruzamento. Lib PURA.
//
// O mesmo cliente tem um cod_cli na NOVA e outro na CASTRO, a cidade vem
// escrita de cinco jeitos ("PIRAJU (SP)", "PIRAJU/SP", "Piraju", "ITAI") e as
// datas vêm em DD/MM/AAAA ou ISO. Tudo que cruza fonte com fonte passa por aqui.
// =============================================================================

export const soDigitos = (s: unknown): string => String(s ?? '').replace(/\D/g, '');

/** CPF (11) ou CNPJ (14) só com dígitos; '' quando não é documento válido de tamanho. */
export function docNorm(s: unknown): string {
  const d = soDigitos(s);
  return d.length === 11 || d.length === 14 ? d : '';
}

/** minúsculas, sem acento, sem pontuação, espaços colapsados. */
export function textoNorm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);

/**
 * "PIRAJU (SP)" | "PIRAJU/SP" | "Piraju - SP" | "Piraju" → { nome: 'piraju', uf: 'SP' | '' }.
 * `ufPadrao` entra quando a cidade vem sem UF (o cadastro tem a coluna estado à parte).
 */
export function cidadeNorm(s: unknown, ufPadrao = ''): { nome: string; uf: string } {
  let txt = String(s ?? '').trim();
  let uf = '';
  const m = txt.match(/^(.*?)[\s]*(?:\(([A-Za-z]{2})\)|[/-]\s*([A-Za-z]{2}))\s*$/);
  if (m && UFS.has((m[2] || m[3]).toUpperCase())) {
    txt = m[1];
    uf = (m[2] || m[3]).toUpperCase();
  }
  if (!uf && UFS.has(String(ufPadrao).toUpperCase())) uf = String(ufPadrao).toUpperCase();
  return { nome: textoNorm(txt), uf };
}

/** Chave única de município: 'piraju|SP'. Sem UF assume SP (a base da loja). */
export function chaveCidade(s: unknown, ufPadrao = ''): string {
  const c = cidadeNorm(s, ufPadrao);
  return c.nome ? `${c.nome}|${c.uf || 'SP'}` : '';
}

/** 'DD/MM/AAAA' ou ISO → 'AAAA-MM-DD'; '' quando não dá pra ler. */
export function dataISO(s: unknown): string {
  const t = String(s ?? '').trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, d, mo, a] = m;
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return '';
    return `${a}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** Dias entre duas datas ISO (b - a). null se faltar alguma. */
export function diasEntre(a: string, b: string): number | null {
  if (!a || !b) return null;
  const ms = Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z');
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

/** 'AAAA-MM-DD' de hoje no fuso de Brasília. */
export function hojeBR(agora = new Date()): string {
  return new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** Soma (ou subtrai) dias de uma data ISO. */
export function somarDias(iso: string, dias: number): string {
  return new Date(Date.parse(iso.slice(0, 10) + 'T12:00:00Z') + dias * 86_400_000).toISOString().slice(0, 10);
}
