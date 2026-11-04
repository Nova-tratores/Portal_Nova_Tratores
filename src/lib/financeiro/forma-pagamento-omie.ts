// Forma de pagamento do card (Chamado_NF) a partir do que o Omie tem — PURA.
// Usada por /api/financeiro/sync-os e /api/financeiro/sync-pecas na CRIAÇÃO do
// card (cards existentes não são mexidos).
//
// O que o Omie tem de verdade (conferido em 29/10/2026, Nova e Castro):
//  - pedido (ConsultarPedido/ListarPedidos): `lista_parcelas.parcela[]` vem só com
//    data_vencimento/numero_parcela/percentual/quantidade_dias/valor — os campos
//    `meio_pagamento`/`tipo_documento` existem na API mas a empresa NÃO preenche;
//    `cabecalho.codigo_parcela` = condição ("000" = À Vista, "001" = 1 parcela,
//    "S18"/"004"… = parceladas — tabela ListarFormasPagVendas).
//  - NF-e emitida: `<tPag>99</tPag>` "Outro Meio de Pagamento" em TODAS (120 notas
//    olhadas); só `<indPag>` diz à vista (0) × a prazo (1).
//  - títulos (contas_receber.raw.codigo_tipo_documento): NFE/NFS — é o tipo do
//    documento fiscal, não o meio de pagamento.
// Ou seja: o meio (Pix/cartão/dinheiro) quase nunca está no Omie. O que dá pra
// saber com segurança é À VISTA × A PRAZO. Regras, em ordem:
//  1. meio explícito numa parcela (meio_pagamento / tipo_documento, códigos da
//     NF-e: 01 dinheiro, 02 cheque, 03/04 cartão, 15 boleto, 16/17/18/20/23 pix,
//     depósito, TED) → usa;
//  2. meio escrito nos dados adicionais da NF / observação da venda ("pago no pix",
//     "pagamento: cartão"…) — só quando há UM meio só, sem ambiguidade;
//  3. À VISTA (codigo_parcela "000" ou parcela única com 0 dias) → "Pix" em
//     Validar Recebimento (nos dados reais, todos os 11 cards à vista criados como
//     "Boleto 30 dias" terminaram sem boleto: "Cliente Sem Boleto"/"Vencido sem
//     boleto"); o obs avisa pra conferir se foi Pix, dinheiro ou cartão;
//  4. senão, como antes: 1 parcela = "Boleto 30 dias", várias = "Boleto Parcelado".

export type FormaPortal =
  | 'Pix' | 'Dinheiro' | 'Cheque' | 'Cartão a vista' | 'Cartão Parcelado'
  | 'Boleto 30 dias' | 'Boleto Parcelado';

export type Meio = 'pix' | 'dinheiro' | 'cheque' | 'cartao' | 'boleto';

export interface ParcelaOmieNorm {
  /** AAAA-MM-DD */
  vencimento: string | null;
  dias: number | null;
  meio?: string | null;
  tipoDocumento?: string | null;
}

export interface EntradaForma {
  codigoParcela?: string | null;
  parcelas: ParcelaOmieNorm[];
  /** Textos livres onde alguém pode ter escrito o meio (dados adicionais da NF, obs da venda). */
  textos?: unknown[];
  /** Vencimento quando o Omie não manda parcela (ex.: data de previsão do pedido). */
  vencimentoPadrao?: string | null;
}

export interface FormaDecidida {
  forma_pagamento: FormaPortal;
  qtd_parcelas: number;
  vencimento_boleto: string | null;
  datas_parcelas: string;
  status: 'gerar_boleto' | 'validar_pix';
  tarefa: string;
  fonte: 'meio_pagamento' | 'texto' | 'a_vista' | 'parcelas';
  /** Frase pro obs do card (vazia quando é o caso de sempre). */
  aviso: string;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** DD/MM/AAAA → AAAA-MM-DD (null se inválida). */
export function dataBRparaISO(s: unknown): string | null {
  const m = String(s ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Código/sigla de meio de pagamento (Omie / NF-e tPag) → meio; null = não diz. */
export function meioDeCodigo(v: unknown): Meio | null {
  const t = semAcento(String(v ?? '')).trim();
  if (!t) return null;
  const num = t.replace(/^0+(?=\d)/, '');
  if (/^\d+$/.test(t)) {
    if (num === '1') return 'dinheiro';
    if (num === '2') return 'cheque';
    if (num === '3' || num === '4') return 'cartao';
    if (num === '15') return 'boleto';
    if (['16', '17', '18', '20', '23'].includes(num)) return 'pix'; // depósito/TED/PIX: entra sem boleto
    return null; // 99 outros, 90 sem pagamento, 99999…
  }
  if (/^pix\b/.test(t)) return 'pix';
  if (/^(din|dinheiro|especie)\b/.test(t)) return 'dinheiro';
  if (/^(chq|cheque)\b/.test(t)) return 'cheque';
  if (/^(crt|cartao)\b/.test(t)) return 'cartao';
  if (/^(bol|boleto|blt)\b/.test(t)) return 'boleto';
  if (/^(ted|dep|deposito|transferencia)\b/.test(t)) return 'pix';
  return null; // NFE, NFS, REC…
}

/**
 * Meio escrito num texto livre. Pix vale sozinho (palavra sem outro sentido);
 * os outros só perto de "pag…"/"receb…"/"forma" — "cheque de revisão" e
 * "cartão SD" não podem virar forma de pagamento.
 */
export function meioDoTexto(texto: unknown): Meio | null {
  const t = semAcento(String(texto ?? ''));
  if (!t.trim()) return null;
  const achados = new Set<Meio>();
  if (/\bpix\b/.test(t)) achados.add('pix');
  const re = /\b(?:pag\w*|receb\w*|forma)\b[^.\n;]{0,25}?\b(dinheiro|especie|cheques?|cartao|cartoes|boletos?)\b/g;
  for (const m of t.matchAll(re)) {
    const w = m[1];
    if (w === 'dinheiro' || w === 'especie') achados.add('dinheiro');
    else if (w.startsWith('cheque')) achados.add('cheque');
    else if (w.startsWith('cart')) achados.add('cartao');
    else achados.add('boleto');
  }
  return achados.size === 1 ? [...achados][0] : null;
}

function unico<T>(itens: (T | null)[]): T | null {
  const s = new Set(itens.filter((x): x is T => x != null));
  return s.size === 1 ? [...s][0] : null;
}

export function ehAVista(e: Pick<EntradaForma, 'codigoParcela' | 'parcelas'>): boolean {
  if (String(e.codigoParcela ?? '').trim() === '000') return true;
  const p = e.parcelas || [];
  return p.length === 1 && p[0].dias === 0;
}

function formaDoMeio(meio: Meio, qtd: number): FormaPortal {
  switch (meio) {
    case 'pix': return 'Pix';
    case 'dinheiro': return 'Dinheiro';
    case 'cheque': return 'Cheque';
    case 'cartao': return qtd > 1 ? 'Cartão Parcelado' : 'Cartão a vista';
    case 'boleto': return qtd > 1 ? 'Boleto Parcelado' : 'Boleto 30 dias';
  }
}

export function ehBoleto(forma: string): boolean {
  return /^boleto/i.test(forma);
}

/** Decide forma, parcelas, fase inicial e tarefa do card novo. */
export function decidirFormaPagamento(e: EntradaForma): FormaDecidida {
  const parcelas = e.parcelas || [];
  const datas = parcelas.map((p) => p.vencimento).filter((d): d is string => !!d);
  const qtd = Math.max(1, datas.length);
  const vencimento = datas[0] || e.vencimentoPadrao || null;
  const datasResto = qtd > 1 ? datas.slice(1).join(', ') : '';

  let meio: Meio | null = unico(parcelas.flatMap((p) => [meioDeCodigo(p.meio), meioDeCodigo(p.tipoDocumento)]));
  let fonte: FormaDecidida['fonte'] = 'meio_pagamento';
  let aviso = '';
  if (!meio) {
    meio = unico((e.textos || []).map(meioDoTexto));
    fonte = 'texto';
  }
  if (!meio && ehAVista({ codigoParcela: e.codigoParcela, parcelas })) {
    meio = 'pix';
    fonte = 'a_vista';
    aviso = 'À vista no Omie (o Omie não informa o meio) — confira se foi Pix, dinheiro ou cartão.';
  }
  if (!meio) {
    meio = 'boleto';
    fonte = 'parcelas';
  }

  const forma = formaDoMeio(meio, qtd);
  const boleto = ehBoleto(forma);
  if (fonte === 'texto') aviso = `Forma de pagamento lida do texto da nota/pedido (${forma}) — confira.`;
  return {
    forma_pagamento: forma,
    qtd_parcelas: qtd,
    vencimento_boleto: vencimento,
    datas_parcelas: datasResto,
    status: boleto ? 'gerar_boleto' : 'validar_pix',
    tarefa: boleto ? 'Gerar Boleto' : `Validar Recebimento ${forma}`,
    fonte,
    aviso,
  };
}

// ── Extratores (JSON cru do Omie → EntradaForma) ─────────────────────────────

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const numOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Pedido de venda (ConsultarPedido → pedido_venda_produto). */
export function entradaDoPedido(pv: unknown): EntradaForma {
  const p = obj(pv);
  const cab = obj(p.cabecalho);
  const ia = obj(p.informacoes_adicionais);
  const obs = obj(p.observacoes);
  const lista = obj(p.lista_parcelas).parcela ?? p.parcelas;
  const arr = Array.isArray(lista) ? lista.map(obj) : [];
  return {
    codigoParcela: cab.codigo_parcela == null ? null : String(cab.codigo_parcela),
    parcelas: arr.map((x) => ({
      vencimento: dataBRparaISO(x.data_vencimento ?? x.dt_venc ?? x.dDtVenc),
      dias: numOuNull(x.quantidade_dias ?? x.nDias),
      meio: (x.meio_pagamento ?? null) as string | null,
      tipoDocumento: (x.tipo_documento ?? null) as string | null,
    })),
    textos: [ia.dados_adicionais_nf, obs.obs_venda],
    vencimentoPadrao: dataBRparaISO(cab.data_previsao),
  };
}

/** Ordem de serviço (ConsultarOS). As Observações da OS (relatório do serviço) ficam de fora de propósito. */
export function entradaDaOS(os: unknown): EntradaForma {
  const o = obj(os);
  const cab = obj(o.Cabecalho);
  const ia = obj(o.InformacoesAdicionais);
  const arr = Array.isArray(o.Parcelas) ? (o.Parcelas as unknown[]).map(obj) : [];
  return {
    codigoParcela: cab.cCodParc == null ? null : String(cab.cCodParc),
    parcelas: arr.map((x) => ({
      vencimento: dataBRparaISO(x.dDtVenc),
      dias: numOuNull(x.nDias),
      meio: (x.meio_pagamento ?? x.cMeioPagamento ?? null) as string | null,
      tipoDocumento: (x.tipo_documento ?? x.cTipoDoc ?? null) as string | null,
    })),
    textos: [ia.cDadosAdicNF],
    vencimentoPadrao: null,
  };
}
