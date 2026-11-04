// Regras PURAS das notas fiscais da garantia (sem banco):
// - NFS-e de REEMBOLSO = nota de serviço que a Nova emite contra a montadora.
//   Mahindra: uma por demonstrativo (DRVG) cobrindo várias SGs, com o texto
//   "REFERENTE A DRVG 7642 DA SOLICITACAO DE GARANTIA SG 2026-046, 48, 62 e 71".
//   Kuhn: cita a SG em cada item ("Hora Trabalhada - STRONGER 4000 HD - SG 3 3 7745686").
//   Os itens da OS no Omie separam Hora Trabalhada / Deslocamento por KM / Peças.
// - Peças recebidas = nota de ENTRADA da montadora com CFOP x.949 (na origem 5.949/6.949).

export type Componente = 'mao_obra' | 'deslocamento' | 'pecas' | 'terceiros' | 'texto';

export const COMPONENTE_LABEL: Record<Componente, string> = {
  mao_obra: 'Mão de obra',
  deslocamento: 'Deslocamento',
  pecas: 'Peças',
  terceiros: 'Serviços de terceiros',
  texto: 'Texto',
};

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Item da OS no Omie → componente do reembolso. Valor ~0 (0,000001) é a linha
// que o faturista usa só para escrever o texto da nota.
export function componenteDoItem(descricao: string, valor: number): Componente {
  if (Math.abs(Number(valor) || 0) < 0.01) return 'texto';
  const d = semAcento(String(descricao || '')).toLowerCase();
  if (/desloc|\bkm\b|quilomet/.test(d)) return 'deslocamento';
  if (/\bpe[cç]as?\b|pecas/.test(d)) return 'pecas';
  if (/terceir/.test(d)) return 'terceiros';
  if (/hora|m[aã]o de obra|entrega tecnica|servi[cç]o/.test(d)) return 'mao_obra';
  return 'terceiros';
}

export function somarComponentes(itens: { descricao: string; valor: number }[]): Record<Componente, number> {
  const t: Record<Componente, number> = { mao_obra: 0, deslocamento: 0, pecas: 0, terceiros: 0, texto: 0 };
  for (const i of itens) t[componenteDoItem(i.descricao, i.valor)] += Number(i.valor) || 0;
  for (const k of Object.keys(t) as Componente[]) t[k] = Math.round(t[k] * 100) / 100;
  return t;
}

// Número da SG para comparar: "2026-067" / "2026-67" → "2026-067"; Kuhn "B M 7742194" → "7742194".
export function normSG(s: string | null | undefined): string {
  const t = String(s || '').toUpperCase().trim();
  const m = t.match(/(\d{4})\s*-\s*(\d{1,4})/);
  if (m) return `${m[1]}-${m[2].padStart(3, '0')}`;
  const d = t.match(/\d{5,}/g);
  return d ? d[d.length - 1] : '';
}

// SGs citadas num texto de nota. Mahindra lista o ano só na 1ª ("SG 2026-046, 48, 62 e 71").
export function extrairSGs(texto: string | null | undefined): string[] {
  const t = semAcento(String(texto || '')).toUpperCase();
  const out = new Set<string>();
  const reAno = /SG\s*(\d{4})\s*-\s*(\d{1,4})((?:\s*(?:,|\bE\b|\/|;)\s*\d{1,4}\b)*)/g;
  for (const m of t.matchAll(reAno)) {
    out.add(`${m[1]}-${m[2].padStart(3, '0')}`);
    for (const n of (m[3] || '').match(/\d{1,4}/g) || []) out.add(`${m[1]}-${n.padStart(3, '0')}`);
  }
  // Kuhn: "SG 3 3 7745686", "SG B M 7743900" (letras/dígitos soltos antes do número longo)
  const reKuhn = /\bSG\s+(?:[A-Z0-9]\s+){0,3}(\d{6,})/g;
  for (const m of t.matchAll(reKuhn)) out.add(m[1]);
  // "SOLICITACAO DE GARANTIA B M 7742194" sem a sigla SG
  const reSol = /SOLICITACAO DE GARANTIA\s+(?:[A-Z0-9]\s+){0,3}(\d{6,})/g;
  for (const m of t.matchAll(reSol)) out.add(m[1]);
  return [...out];
}

export function extrairDRVG(texto: string | null | undefined): string | null {
  const m = String(texto || '').toUpperCase().match(/DRVG\s*[-:Nº°.]*\s*(\d{3,})/);
  return m ? m[1] : null;
}

// CFOP de "outra entrada/saída" (remessa em garantia): 1.949, 2.949, 5.949, 6.949.
export function ehCfopGarantia(cfop: string | null | undefined): boolean {
  return /949$/.test(String(cfop || '').replace(/\D/g, ''));
}

// Código de peça para comparar: sem espaço/ponto/traço, sem o prefixo RP da Mahindra.
export function normCodigo(c: string | null | undefined): string {
  const t = String(c || '').toUpperCase().replace(/[\s.\-_/]/g, '');
  return t.replace(/^RP(?=[A-Z0-9]{6,})/, '');
}

export interface PecaGarantia { cod_produto: string | null; descricao: string | null }
export interface ItemNota { codigo: string; descricao: string; cfop: string; valor: number; quantidade: number }
export interface CasamentoPeca { item: number; peca: string; como: 'codigo' | 'descricao' }

// Quais itens da nota são peças desta garantia. Código exato (normalizado) ou o
// código aparece na descrição do item (Kuhn escreve "TUBO HIDRAULICO = B2177510").
export function casarPecas(pecas: PecaGarantia[], itens: ItemNota[]): CasamentoPeca[] {
  const cods = pecas
    .map((p) => String(p.cod_produto || '').trim())
    .filter((c) => c && !/^(MDI|REQ-)/i.test(c) && normCodigo(c).length >= 5);
  const out: CasamentoPeca[] = [];
  itens.forEach((it, idx) => {
    const ci = normCodigo(it.codigo);
    const di = normCodigo(it.descricao);
    for (const c of cods) {
      const n = normCodigo(c);
      if (ci && ci === n) { out.push({ item: idx, peca: c, como: 'codigo' }); return; }
      if (di.includes(n)) { out.push({ item: idx, peca: c, como: 'descricao' }); return; }
    }
  });
  return out;
}

// ── Prévia da OS de reembolso (gerar e faturar pelo portal) ──────────────────

export interface GarantiaReembolso {
  numero: string;
  numero_externo: string | null;
  valor_pago_horas: number | null;
  valor_pago_km: number | null;
  valor_pago_pecas: number | null;
}

export interface PreviaReembolso {
  texto: string;
  itens: { descricao: string; componente: Componente; valor: number }[];
  total: number;
  sgs: string[];
}

function n2(v: unknown): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}

// "SG 2026-046, 48, 62 e 71" — mesmo jeito que o faturista escreve hoje.
export function textoSGs(sgs: string[]): string {
  const norm = sgs.map(normSG).filter(Boolean).sort();
  if (!norm.length) return '';
  const ano = norm[0].slice(0, 4);
  const mesmoAno = norm.every((s) => s.startsWith(ano + '-'));
  if (!mesmoAno) return 'SG ' + norm.join(', ');
  const nums = norm.map((s, i) => (i === 0 ? s : s.slice(5).replace(/^0+(?=\d{2})/, '')));
  return 'SG ' + (nums.length > 1 ? nums.slice(0, -1).join(', ') + ' e ' + nums[nums.length - 1] : nums[0]);
}

export function montarPreviaReembolso(
  garantias: GarantiaReembolso[],
  ref: { drvg?: string | null; pedidoCompra?: string | null } = {},
): PreviaReembolso {
  const sgs = garantias.map((g) => g.numero_externo || g.numero);
  const mo = n2(garantias.reduce((s, g) => s + n2(g.valor_pago_horas), 0));
  const km = n2(garantias.reduce((s, g) => s + n2(g.valor_pago_km), 0));
  const pc = n2(garantias.reduce((s, g) => s + n2(g.valor_pago_pecas), 0));
  const total = n2(mo + km + pc);
  const partes = [
    ref.pedidoCompra ? `PEDIDO DE COMPRA ${ref.pedidoCompra}` : '',
    `VALOR: R$${total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `REFERENTE A ${ref.drvg ? `DRVG ${ref.drvg} DA ` : ''}SOLICITACAO DE GARANTIA ${textoSGs(sgs)}`,
  ].filter(Boolean);
  const itens = [
    { descricao: 'Hora Trabalhada', componente: 'mao_obra' as const, valor: mo },
    { descricao: 'Deslocamento por KM', componente: 'deslocamento' as const, valor: km },
    { descricao: 'Peças', componente: 'pecas' as const, valor: pc },
  ].filter((i) => i.valor > 0);
  return { texto: partes.join('| '), itens, total, sgs };
}
