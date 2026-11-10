// Como o espelho (contas_pagar / contas_receber) fica depois de uma baixa aceita pela
// Omie. Regra PURA (sem banco, sem Omie).
//
// Antes, toda baixa gravava status PAGO/RECEBIDO e valor_pago = valor desta baixa —
// também a PARCIAL (boleto que paga parte de uma duplicata, baixa avulsa menor que o
// saldo): o título sumia da Baixa de contas e do DRE como "em aberto" até o próximo
// sync, e o valor_pago perdia o que já tinha sido pago antes.
//
// Preferência: o que a Omie diz DEPOIS da baixa (status e valor pago relidos). Sem a
// releitura: soma ao que o espelho já tinha e só liquida quando cobre o documento.

export interface EspelhoAntes {
  status_titulo?: string | null;
  valor_documento?: number | string | null;
  valor_pago?: number | string | null;
}

export interface OmieDepois {
  status_titulo?: string | null;
  valor_pago?: number | string | null;
}

export interface UpdateEspelhoBaixa {
  status_titulo?: string;
  valor_pago: number;
  data_pagamento: string;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const arred = (v: number) => Math.round(v * 100) / 100;

export function espelhoAposBaixa(a: {
  tipo: 'pagar' | 'receber';
  dataISO: string;
  valorBaixa: number;
  desconto?: number;
  antes?: EspelhoAntes | null;
  /** título relido na Omie depois da baixa (null = a releitura falhou) */
  omie?: OmieDepois | null;
}): { update: UpdateEspelhoBaixa; liquidou: boolean; fonte: 'omie' | 'calculo' } {
  const liquidado = a.tipo === 'receber' ? 'RECEBIDO' : 'PAGO';
  const st = String(a.omie?.status_titulo || '').trim().toUpperCase();
  if (a.omie && st) {
    const update: UpdateEspelhoBaixa = { status_titulo: st, valor_pago: arred(n(a.omie.valor_pago)), data_pagamento: a.dataISO };
    // a Omie às vezes não devolve valor_pago: aí soma ao que o espelho tinha
    if (a.omie.valor_pago == null || a.omie.valor_pago === '') update.valor_pago = arred(n(a.antes?.valor_pago) + n(a.valorBaixa));
    return { update, liquidou: st === liquidado, fonte: 'omie' };
  }
  const pagoAntes = n(a.antes?.valor_pago);
  const doc = n(a.antes?.valor_documento);
  const pago = arred(pagoAntes + n(a.valorBaixa));
  // sem valor do documento no espelho não dá para saber se foi parcial: segue o antigo
  const liquidou = doc <= 0 || pago + n(a.desconto) >= doc - 0.01;
  const update: UpdateEspelhoBaixa = { valor_pago: pago, data_pagamento: a.dataISO };
  if (liquidou) update.status_titulo = liquidado;
  return { update, liquidou, fonte: 'calculo' };
}
