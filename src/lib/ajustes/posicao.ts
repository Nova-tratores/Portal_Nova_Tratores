// Helpers PUROS de posição física de peça (Prateleira → Andar → Caixa), lidos das
// características #PRATELEIRA / #ANDAR / #CAIXA (+ #ANDAR2/#CAIXA2, encoding
// alternativo raro) do JSONB de produtos_caracteristicas.
// Saíram de /ajustes/localizacao (01/10/2026) para serem compartilhados com o
// painel "A alocar" de /ajustes/caracteristicas e com o motor de alocação
// (src/lib/pecas/alocacao.ts). Sem banco, sem React.

export interface ProdutoLoc {
  empresa: string; codigo_produto: number | string; codigo?: string; descricao?: string;
  modelo?: string; marca?: string; estoque?: number;
  caracteristicas?: Record<string, string>;
}
export interface Pos { prat: string; andar: string; caixa: string }

export function norm(s: string): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

// lê uma característica pelo nome canônico, sem se importar com casing/acento
export function getCar(car: Record<string, string> | undefined | null, canon: string): string {
  if (!car) return '';
  const alvo = norm(canon);
  for (const k of Object.keys(car)) if (norm(k) === alvo) return String(car[k] ?? '');
  return '';
}

// posição efetiva a partir do JSONB (coalesce das secundárias raras)
export function posDeCar(car: Record<string, string> | undefined | null): Pos & { temLoc: boolean } {
  const prat = getCar(car, '#PRATELEIRA').trim();
  const andar = (getCar(car, '#ANDAR') || getCar(car, '#ANDAR2')).trim();
  const caixa = (getCar(car, '#CAIXA') || getCar(car, '#CAIXA2')).trim();
  return { prat, andar, caixa, temLoc: !!(prat || andar || caixa) };
}
export function posDe(p: ProdutoLoc): Pos & { temLoc: boolean } {
  return posDeCar(p.caracteristicas);
}

export function chaveProd(p: { empresa: string; codigo_produto: number | string }): string {
  return `${p.empresa}|${p.codigo_produto}`;
}
export function labelSeg(v: string): string { return v.trim() === '' ? '—' : v; }

// segmento "placeholder"/sujo (XXX / 000 / 0000 / ---) — dado inválido de localização
export function segPlaceholder(v: string): boolean {
  const s = v.trim();
  if (s === '') return false;
  return /^0+$/.test(s) || /^x+$/i.test(s) || /^-+$/.test(s);
}
// posição inválida: qualquer segmento preenchido é placeholder
export function posInvalida(pos: Pos): boolean {
  return segPlaceholder(pos.prat) || segPlaceholder(pos.andar) || segPlaceholder(pos.caixa);
}
// posição legível (para listas)
export function posLabel(pos: Pos): string {
  return `${labelSeg(pos.prat)} · ${labelSeg(pos.andar)} · ${labelSeg(pos.caixa)}`;
}

// ordena segmentos: vazio ('—') por último, resto numérico-aware
export function cmpSeg(a: string, b: string): number {
  const ae = a.trim() === '', be = b.trim() === '';
  if (ae && be) return 0;
  if (ae) return 1;
  if (be) return -1;
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

// Ocupantes de uma posição (exceto o próprio alvo), dentro da lista dada (uma empresa)
export function ocupantesDe<T extends ProdutoLoc>(produtosEmpresa: T[], pos: Pos, excetoKey?: string): T[] {
  return produtosEmpresa.filter((p) => {
    if (excetoKey && chaveProd(p) === excetoKey) return false;
    const q = posDe(p);
    return q.prat === pos.prat.trim() && q.andar === pos.andar.trim() && q.caixa === pos.caixa.trim();
  });
}

// Texto da locação na ETIQUETA ("PRATELEIRA 3 · ANDAR G · CAIXA 1"), mesmo formato
// do EtiquetasPanel / addEtiqueta da Localização. Placeholder não entra.
export function locacaoEtiqueta(car: Record<string, string> | undefined | null): string {
  const pares: string[] = [];
  for (const k of ['#PRATELEIRA', '#ANDAR', '#CAIXA']) {
    const v = getCar(car, k).trim();
    if (v && !segPlaceholder(v)) pares.push(`${k.slice(1)} ${v}`);
  }
  return pares.join(' · ');
}
