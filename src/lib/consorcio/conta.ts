/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// CONSÓRCIO NO EVENTO — a conta da parcela e os tipos (usado na página aberta e no portal).
//
// A fórmula foi tirada da tabela do grupo 6008 (dez/2026) e fecha até o centavo com ela:
//   total   = crédito × (1 + taxa de administração + fundo de reserva)       → 181.286 × 1,16 = 210.291,76
//   parcela = total ÷ prazo  +  total × seguro de vida (0,084%)             → 1.752,43 + 176,65 = 1.929,08
//   crédito com lance embutido de 20% = crédito − total × 20%                → 181.286 − 42.058,35 = 139.228
// =============================================================================

export interface ModeloConsorcio { nome: string; codigo?: string; credito: number }

export interface ConfigConsorcio {
  administradora?: string;
  grupo?: string;
  prazo_meses: number;
  taxa_adm_pct: number;
  fundo_reserva_pct: number;
  seguro_pct: number;
  lance_embutido_pct: number;
  vencimento?: string | null;          // 'AAAA-MM-DD'
  proxima_assembleia?: string | null;  // 'AAAA-MM-DD'
  destaques?: string[];
  modelos?: ModeloConsorcio[];
}

export const CONFIG_PADRAO: ConfigConsorcio = {
  prazo_meses: 120, taxa_adm_pct: 15, fundo_reserva_pct: 1, seguro_pct: 0.084, lance_embutido_pct: 20,
  destaques: [], modelos: [],
};

/** Junta o que veio do banco com o padrão (campo faltando não quebra a conta). */
export function lerConfig(c: any): ConfigConsorcio {
  const n = (v: any, p: number) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : p);
  return {
    ...CONFIG_PADRAO,
    ...(c || {}),
    prazo_meses: n(c?.prazo_meses, CONFIG_PADRAO.prazo_meses) || CONFIG_PADRAO.prazo_meses,
    taxa_adm_pct: n(c?.taxa_adm_pct, CONFIG_PADRAO.taxa_adm_pct),
    fundo_reserva_pct: n(c?.fundo_reserva_pct, CONFIG_PADRAO.fundo_reserva_pct),
    seguro_pct: n(c?.seguro_pct, CONFIG_PADRAO.seguro_pct),
    lance_embutido_pct: n(c?.lance_embutido_pct, CONFIG_PADRAO.lance_embutido_pct),
    destaques: Array.isArray(c?.destaques) ? c.destaques.filter(Boolean) : [],
    modelos: Array.isArray(c?.modelos) ? c.modelos.filter((m: any) => m?.nome && Number(m?.credito) > 0) : [],
  };
}

/** Crédito + taxas: é sobre este valor que a parcela e o lance são calculados. */
export const totalComTaxas = (credito: number, c: ConfigConsorcio) =>
  credito * (1 + (c.taxa_adm_pct + c.fundo_reserva_pct) / 100);

export const parcela = (credito: number, c: ConfigConsorcio) => {
  const t = totalComTaxas(credito, c);
  return t / c.prazo_meses + t * (c.seguro_pct / 100);
};

/** Parcela ÷ 30: o "investimento por dia" da tabela. */
export const porDia = (credito: number, c: ConfigConsorcio) => parcela(credito, c) / 30;

/** Quanto sobra para comprar o trator se usar o lance embutido máximo. */
export const creditoComEmbutido = (credito: number, c: ConfigConsorcio) =>
  credito - totalComTaxas(credito, c) * (c.lance_embutido_pct / 100);

export const reais = (v: number, casas = 2) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas });

/** 7 → "007": o número da sorte sempre com 3 dígitos, fácil de falar no microfone. */
export const numeroSorte = (n: number) => String(n).padStart(3, '0');
