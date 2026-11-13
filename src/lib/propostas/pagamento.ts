// Pagamento estruturado da Proposta — parte PURA (sem banco).
// Usado pela tela da Proposta (montar) e pelo Pedido de Máquinas (importar).
//
// Regras:
//  - parcela = { n, vencimento YYYY-MM-DD, valor, percentual, meio };
//  - gerar: (total − entrada) dividido em N parcelas a cada X dias a partir da
//    data base (ou por uma lista de dias "30/60/90"); centavos que sobram vão na
//    ÚLTIMA parcela; percentuais somam 100 sobre o total (entrada incluída);
//  - a soma (entrada + parcelas) diferente do total só AVISA, nunca trava.

export type FormaPagamento = 'avista' | 'parcelado' | 'financiado' | 'misto';
export type MeioParcela = 'boleto' | 'cheque' | 'financiamento' | 'pix' | 'outro';

export const FORMAS: { valor: FormaPagamento; rotulo: string }[] = [
  { valor: 'avista', rotulo: 'À vista' },
  { valor: 'parcelado', rotulo: 'Parcelado (direto)' },
  { valor: 'financiado', rotulo: 'Financiado (banco)' },
  { valor: 'misto', rotulo: 'Entrada + financiamento' },
];

export const MEIOS: { valor: MeioParcela; rotulo: string }[] = [
  { valor: 'boleto', rotulo: 'Boleto' },
  { valor: 'pix', rotulo: 'PIX / transferência' },
  { valor: 'cheque', rotulo: 'Cheque' },
  { valor: 'financiamento', rotulo: 'Financiamento' },
  { valor: 'outro', rotulo: 'Outro' },
];

export const LINHAS_CREDITO = ['FINAME', 'Moderfrota', 'Pronaf Mais Alimentos', 'Pronamp', 'Inovagro', 'CDC', 'Consórcio', 'Outra'];

export interface ParcelaProposta {
  n: number;
  vencimento: string; // YYYY-MM-DD
  valor: number;
  percentual: number;
  meio: MeioParcela;
}

export interface PagamentoProposta {
  forma: FormaPagamento;
  entrada_valor: number | null;
  entrada_data: string | null;
  parcelas: ParcelaProposta[];
  banco: string | null;
  linha_credito: string | null;
  obs: string | null;
}

export const PAGAMENTO_VAZIO: PagamentoProposta = {
  forma: 'parcelado', entrada_valor: null, entrada_data: null, parcelas: [],
  banco: null, linha_credito: null, obs: null,
};

const centavos = (v: number) => Math.round((Number(v) || 0) * 100);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Valor em texto BR ("1.290,50"), US ("1290.50") ou número → número. */
export function numeroBR(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v ?? '').replace(/[R$\s]/g, '').trim();
  if (!s) return 0;
  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    // o separador decimal é o que aparece por último
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (temVirgula) {
    s = s.replace(',', '.');
  } else if (temPonto && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // "150.000" = cento e cinquenta mil
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** YYYY-MM-DD + N dias (aritmética em UTC puro). */
export function somarDiasISO(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** YYYY-MM-DD + N meses, mantendo o dia (31/01 + 1 mês = 28/02). */
export function somarMesesISO(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

export function dataBR(iso: string | null | undefined): string {
  if (!iso || !ISO.test(iso)) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export function brl(v: number): string {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export interface OpcoesGerar {
  total: number;
  entrada?: number;
  base: string;          // YYYY-MM-DD — 1º vencimento conta daqui
  /** N parcelas espaçadas. `intervalo` = 'mensal' ou nº de dias. */
  quantidade?: number;
  intervalo?: 'mensal' | 'anual' | number;
  /** Dias da primeira parcela a partir da base (padrão = 1 intervalo). */
  carenciaDias?: number;
  /** Alternativa: lista de dias "30/60/90". Vence `quantidade`/`intervalo`. */
  dias?: number[];
  meio?: MeioParcela;
}

/** Gera as parcelas do saldo (total − entrada). */
export function gerarParcelas(o: OpcoesGerar): ParcelaProposta[] {
  const totalC = centavos(o.total);
  const saldoC = totalC - centavos(o.entrada || 0);
  if (!(saldoC > 0) || !ISO.test(o.base)) return [];
  const meio = o.meio || 'boleto';

  let datas: string[];
  if (o.dias && o.dias.length) {
    datas = o.dias.map((d) => somarDiasISO(o.base, d));
  } else {
    const n = Math.max(1, Math.min(240, Math.floor(o.quantidade || 1)));
    const iv = o.intervalo ?? 'mensal';
    const primeira = o.carenciaDias != null
      ? somarDiasISO(o.base, o.carenciaDias)
      : iv === 'mensal' ? somarMesesISO(o.base, 1) : iv === 'anual' ? somarMesesISO(o.base, 12) : somarDiasISO(o.base, iv);
    datas = Array.from({ length: n }, (_, i) =>
      iv === 'mensal' ? somarMesesISO(primeira, i) : iv === 'anual' ? somarMesesISO(primeira, 12 * i) : somarDiasISO(primeira, iv * i));
  }

  const n = datas.length;
  const baseC = Math.floor(saldoC / n);
  return datas.map((vencimento, i) => {
    const valorC = i === n - 1 ? saldoC - baseC * (n - 1) : baseC;
    return {
      n: i + 1,
      vencimento,
      valor: valorC / 100,
      percentual: totalC > 0 ? Math.round((valorC / totalC) * 10000) / 100 : 0,
      meio,
    };
  });
}

/** Renumera e recalcula os percentuais depois de uma edição manual. */
export function recalcularPercentuais(parcelas: ParcelaProposta[], total: number): ParcelaProposta[] {
  const totalC = centavos(total);
  return parcelas.map((p, i) => ({
    ...p,
    n: i + 1,
    valor: centavos(p.valor) / 100,
    percentual: totalC > 0 ? Math.round((centavos(p.valor) / totalC) * 10000) / 100 : 0,
  }));
}

export interface ConferenciaPagamento {
  somaC: number;
  totalC: number;
  diferenca: number; // reais; positivo = falta, negativo = sobra
  ok: boolean;
  avisos: string[];
}

export function conferirPagamento(p: PagamentoProposta, total: number): ConferenciaPagamento {
  const totalC = centavos(total);
  const somaC = centavos(p.entrada_valor || 0) + p.parcelas.reduce((s, x) => s + centavos(x.valor), 0);
  const avisos: string[] = [];
  if (p.forma !== 'avista' && !p.parcelas.length && !(p.entrada_valor && p.entrada_valor > 0)) {
    avisos.push('Nenhuma parcela informada.');
  }
  if (totalC > 0 && somaC !== totalC && (p.parcelas.length || p.entrada_valor)) {
    const dif = (totalC - somaC) / 100;
    avisos.push(dif > 0 ? `Faltam ${brl(dif)} para fechar o valor total.` : `As parcelas passam ${brl(-dif)} do valor total.`);
  }
  const datas = p.parcelas.map((x) => x.vencimento);
  if (datas.some((d) => !ISO.test(d))) avisos.push('Há parcela sem data de vencimento.');
  for (let i = 1; i < datas.length; i++) {
    if (ISO.test(datas[i]) && ISO.test(datas[i - 1]) && datas[i] < datas[i - 1]) {
      avisos.push('As datas das parcelas estão fora de ordem.');
      break;
    }
  }
  if ((p.forma === 'financiado' || p.forma === 'misto') && !p.banco) avisos.push('Informe o banco do financiamento.');
  return { somaC, totalC, diferenca: (totalC - somaC) / 100, ok: avisos.length === 0, avisos };
}

/** Normaliza o que veio do banco/corpo da requisição. */
export function normalizarPagamento(bruto: unknown): PagamentoProposta {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const forma = FORMAS.some((f) => f.valor === b.forma) ? (b.forma as FormaPagamento) : 'parcelado';
  const txt = (v: unknown) => { const s = String(v ?? '').trim(); return s ? s.slice(0, 500) : null; };
  const ent = b.entrada_valor == null || b.entrada_valor === '' ? null : numeroBR(b.entrada_valor);
  const entradaData = typeof b.entrada_data === 'string' && ISO.test(b.entrada_data) ? b.entrada_data : null;
  const lista = Array.isArray(b.parcelas) ? b.parcelas : [];
  const parcelas: ParcelaProposta[] = lista.slice(0, 240).map((x: Record<string, unknown>, i: number) => ({
    n: i + 1,
    vencimento: typeof x?.vencimento === 'string' && ISO.test(x.vencimento) ? x.vencimento : '',
    valor: centavos(numeroBR(x?.valor)) / 100,
    percentual: Number(x?.percentual) || 0,
    meio: MEIOS.some((m) => m.valor === x?.meio) ? (x.meio as MeioParcela) : 'boleto',
  }));
  return {
    forma,
    entrada_valor: ent && ent > 0 ? centavos(ent) / 100 : null,
    entrada_data: entradaData,
    parcelas,
    banco: txt(b.banco),
    linha_credito: txt(b.linha_credito),
    obs: txt(b.obs),
  };
}

/** Texto curto para o campo "Condicoes" (sai no PDF da proposta). */
export function resumoCondicoes(p: PagamentoProposta): string {
  const partes: string[] = [];
  if (p.forma === 'avista' && !p.parcelas.length) {
    partes.push(p.entrada_data ? `À vista em ${dataBR(p.entrada_data)}` : 'À vista');
  }
  if (p.entrada_valor && p.entrada_valor > 0) {
    partes.push(`Entrada ${brl(p.entrada_valor)}${p.entrada_data ? ` em ${dataBR(p.entrada_data)}` : ''}`);
  }
  if (p.parcelas.length) {
    const valores = new Set(p.parcelas.map((x) => centavos(x.valor)));
    const primeira = p.parcelas[0];
    const ultima = p.parcelas[p.parcelas.length - 1];
    const qual = p.parcelas.length === 1 ? '1 parcela' : `${p.parcelas.length} parcelas`;
    const valor = valores.size === 1 ? ` de ${brl(primeira.valor)}` : '';
    const datas = p.parcelas.length === 1
      ? (primeira.vencimento ? ` em ${dataBR(primeira.vencimento)}` : '')
      : (primeira.vencimento && ultima.vencimento ? ` (${dataBR(primeira.vencimento)} a ${dataBR(ultima.vencimento)})` : '');
    partes.push(`${qual}${valor}${datas}`);
  }
  if (p.forma === 'financiado' || p.forma === 'misto') {
    const fin = [p.linha_credito, p.banco].filter(Boolean).join(' · ');
    if (fin) partes.push(fin);
  }
  return partes.join(' + ').slice(0, 300);
}
