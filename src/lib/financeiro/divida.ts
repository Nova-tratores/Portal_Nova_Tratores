// Calculadora de dívida consolidada (tela /financeiro/contas-cliente, 09/11/2026).
// PURA: nada de banco nem Omie — só a conta. Decisão do usuário: a tela só
// SIMULA e imprime o demonstrativo; nada é gravado na Omie.
//
// Regra padrão: multa de 2 % (uma vez, só se houver atraso) + juros de 1 % ao
// mês pro-rata por dia (mês = 30 dias). A empresa pode ter regra própria
// (tabela financeiro_regra_juros) e a pessoa pode ajustar só na simulação.
//
// Carência: atraso de até N dias não cobra nada; passou da carência, cobra
// desde o vencimento (os dias de carência entram na conta).

export type TipoJuros = 'simples' | 'composto';

export interface RegraJuros {
  multa_pct: number;
  juros_mes_pct: number;
  tipo_juros: TipoJuros;
  carencia_dias: number;
  /** Desconto (abono) sobre multa + juros, em %. Nunca mexe no principal. */
  desconto_pct: number;
}

export const REGRA_PADRAO: RegraJuros = {
  multa_pct: 2,
  juros_mes_pct: 1,
  tipo_juros: 'simples',
  carencia_dias: 0,
  desconto_pct: 0,
};

export interface TituloDivida {
  id: string;
  conta: string;          // 'NOVA' | 'CASTRO'
  tipo: 'receber' | 'pagar';
  vencimento: string | null; // YYYY-MM-DD
  valorAberto: number;
  aberto: boolean;
}

export interface TituloAtualizado {
  id: string;
  vencimento: string | null;
  dias: number;
  principal: number;
  multa: number;
  juros: number;
  total: number;
}

export interface Parcela {
  numero: number;
  vencimento: string;
  valor: number;
}

export interface Consolidado {
  itens: TituloAtualizado[];
  principal: number;
  multa: number;
  juros: number;
  encargos: number;
  desconto: number;
  total: number;
  parcelas: Parcela[];
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;

function diaUTC(iso: string): number | null {
  const m = ISO.exec(String(iso || ''));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000;
}

/** Dias corridos do vencimento até a data-base (0 se não venceu). */
export function diasAtraso(vencimento: string | null, dataBase: string): number {
  const v = vencimento ? diaUTC(vencimento) : null;
  const b = diaUTC(dataBase);
  if (v == null || b == null) return 0;
  return Math.max(0, b - v);
}

/** Saneia a regra vinda da tela/banco (números negativos ou vazios viram 0). */
export function normalizarRegra(r: Partial<RegraJuros> | null | undefined): RegraJuros {
  const n = (v: unknown, padrao: number, max: number) => {
    const x = Number(v);
    if (!Number.isFinite(x)) return padrao;
    return Math.min(max, Math.max(0, x));
  };
  return {
    multa_pct: n(r?.multa_pct, REGRA_PADRAO.multa_pct, 100),
    juros_mes_pct: n(r?.juros_mes_pct, REGRA_PADRAO.juros_mes_pct, 100),
    tipo_juros: r?.tipo_juros === 'composto' ? 'composto' : 'simples',
    carencia_dias: Math.floor(n(r?.carencia_dias, 0, 365)),
    desconto_pct: n(r?.desconto_pct, 0, 100),
  };
}

export function atualizarTitulo(t: Pick<TituloDivida, 'id' | 'vencimento' | 'valorAberto'>, regra: RegraJuros, dataBase: string): TituloAtualizado {
  const principal = r2(Math.max(0, Number(t.valorAberto) || 0));
  const dias = diasAtraso(t.vencimento, dataBase);
  if (dias === 0 || dias <= regra.carencia_dias || principal === 0) {
    return { id: t.id, vencimento: t.vencimento, dias, principal, multa: 0, juros: 0, total: principal };
  }
  const multa = r2(principal * regra.multa_pct / 100);
  const i = regra.juros_mes_pct / 100;
  const juros = regra.tipo_juros === 'composto'
    ? r2(principal * (Math.pow(1 + i, dias / 30) - 1))
    : r2(principal * i * dias / 30);
  return { id: t.id, vencimento: t.vencimento, dias, principal, multa, juros, total: r2(principal + multa + juros) };
}

/** Soma N meses a uma data ISO, segurando o dia no fim do mês (31/01 + 1 = 28/02). */
export function somarMeses(iso: string, meses: number): string {
  const m = ISO.exec(iso);
  if (!m) return iso;
  const ano = +m[1], mes = +m[2] - 1 + meses, dia = +m[3];
  const alvoAno = ano + Math.floor(mes / 12);
  const alvoMes = ((mes % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(alvoAno, alvoMes + 1, 0)).getUTCDate();
  const d = Math.min(dia, ultimo);
  return `${alvoAno}-${String(alvoMes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface OpcoesParcelas {
  quantidade: number;
  primeiroVencimento: string;
  /** 'sem_juros' = parcelas iguais; 'price' = tabela Price com o juros a.m. da regra. */
  modo: 'sem_juros' | 'price';
}

/** Divide o total em parcelas; a sobra dos centavos vai na última. */
export function parcelar(total: number, jurosMesPct: number, o: OpcoesParcelas): Parcela[] {
  const n = Math.max(1, Math.min(60, Math.floor(o.quantidade || 1)));
  if (n === 1 || total <= 0) return [{ numero: 1, vencimento: o.primeiroVencimento, valor: r2(total) }];
  const i = jurosMesPct / 100;
  let pmt: number;
  let soma: number;
  if (o.modo === 'price' && i > 0) {
    pmt = r2(total * i / (1 - Math.pow(1 + i, -n)));
    soma = r2(pmt * n);
  } else {
    pmt = Math.floor((total / n) * 100) / 100;
    soma = r2(total);
  }
  const out: Parcela[] = [];
  for (let k = 0; k < n; k++) {
    const valor = k === n - 1 ? r2(soma - pmt * (n - 1)) : pmt;
    out.push({ numero: k + 1, vencimento: somarMeses(o.primeiroVencimento, k), valor });
  }
  return out;
}

export function consolidar(
  titulos: Pick<TituloDivida, 'id' | 'vencimento' | 'valorAberto'>[],
  regra: RegraJuros,
  dataBase: string,
  parcelas?: OpcoesParcelas | null,
): Consolidado {
  const itens = titulos.map((t) => atualizarTitulo(t, regra, dataBase));
  const principal = r2(itens.reduce((s, x) => s + x.principal, 0));
  const multa = r2(itens.reduce((s, x) => s + x.multa, 0));
  const juros = r2(itens.reduce((s, x) => s + x.juros, 0));
  const encargos = r2(multa + juros);
  const desconto = r2(encargos * regra.desconto_pct / 100);
  const total = r2(principal + encargos - desconto);
  const lista = parcelas ? parcelar(total, regra.juros_mes_pct, parcelas) : [];
  return { itens, principal, multa, juros, encargos, desconto, total, parcelas: lista };
}

/** Só a receber, em aberto e de UMA empresa (decisão do usuário). null = ok. */
export function validarSelecao(titulos: Pick<TituloDivida, 'conta' | 'tipo' | 'aberto'>[]): string | null {
  if (!titulos.length) return 'Marque pelo menos um título a receber em aberto.';
  if (titulos.some((t) => t.tipo !== 'receber')) return 'Só títulos a RECEBER entram na consolidação.';
  if (titulos.some((t) => !t.aberto)) return 'Só títulos em aberto entram na consolidação.';
  const contas = new Set(titulos.map((t) => t.conta));
  if (contas.size > 1) return 'Uma empresa por vez: não dá para juntar NOVA e CASTRO no mesmo demonstrativo.';
  return null;
}
