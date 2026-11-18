// Módulo Remessas — regras PURAS (18/11/2026). Usadas pela tela e pelo servidor.
//
// Remessa = "Remessa de Produtos" da Omie. O tipo sai do CFOP do 1º item:
//   5.912/6.912 demonstração (a máquina sai do estoque e volta por NOTA DE ENTRADA própria
//               1.913/2.913 — é assim que a NOVA e a CASTRO fazem, conferido nas NFs 590/8460)
//   5.913/6.913 retorno de demonstração que RECEBEMOS de um fornecedor (Casale, Menta…)
//   5.949/6.949 garantia · 5.910 bonificação/peças de OS · 5.915/6.915 conserto · resto = outra
// Renovar (decisão do usuário 18/11/2026) = nota de entrada de retorno da original + remessa nova,
// o que a CASTRO já fazia à mão todo mês (Joaquim Damasio: remessa 5.912 + entrada 1.913 no mesmo dia).

export type TipoRemessa = 'demonstracao' | 'retorno_forn' | 'garantia' | 'os' | 'conserto' | 'outra';
export type Situacao =
  | 'sem_nota' | 'em_demonstracao' | 'vence_logo' | 'vencida' | 'conferir'
  | 'faturada' | 'devolvida' | 'renovada' | 'virou_venda' | 'cancelada';

export const PRAZO_PADRAO_DIAS = 30;
export const AVISO_DIAS_ANTES = 5;
/** categoria da nota de entrada de retorno (a que a NOVA usa: NF 590 → 2.09.01) */
export const CATEGORIA_RETORNO = '2.09.01';
export const CATEGORIA_DEMO = '1.01.98';

export const TIPOS: Record<TipoRemessa, { rotulo: string; cor: string }> = {
  demonstracao: { rotulo: 'Demonstração', cor: '#7c3aed' },
  retorno_forn: { rotulo: 'Retorno ao fornecedor', cor: '#0f766e' },
  garantia: { rotulo: 'Garantia', cor: '#b45309' },
  os: { rotulo: 'Peças / OS', cor: '#0369a1' },
  conserto: { rotulo: 'Conserto', cor: '#be185d' },
  outra: { rotulo: 'Outra', cor: '#64748b' },
};

export const SITUACOES: Record<Situacao, { rotulo: string; cor: string; aberta: boolean }> = {
  sem_nota: { rotulo: 'Sem nota', cor: '#64748b', aberta: true },
  em_demonstracao: { rotulo: 'Em demonstração', cor: '#16a34a', aberta: true },
  vence_logo: { rotulo: 'Vence logo', cor: '#d97706', aberta: true },
  vencida: { rotulo: 'Prazo vencido', cor: '#dc2626', aberta: true },
  conferir: { rotulo: 'Conferir volta', cor: '#d97706', aberta: true },
  faturada: { rotulo: 'Nota emitida', cor: '#0369a1', aberta: false },
  devolvida: { rotulo: 'Voltou', cor: '#15803d', aberta: false },
  renovada: { rotulo: 'Renovada', cor: '#7c3aed', aberta: false },
  virou_venda: { rotulo: 'Virou venda', cor: '#0f766e', aberta: false },
  cancelada: { rotulo: 'Cancelada', cor: '#94a3b8', aberta: false },
};

const dig = (s: unknown) => String(s ?? '').replace(/\D/g, '');

export function tipoDaRemessa(cfop: string | null | undefined, codInt?: string | null): TipoRemessa {
  const c = dig(cfop);
  if (c === '5912' || c === '6912') return 'demonstracao';
  if (c === '5913' || c === '6913') return 'retorno_forn';
  if (c === '5949' || c === '6949') return 'garantia';
  if (c === '5915' || c === '6915' || c === '5916' || c === '6916') return 'conserto';
  if (c === '5910' || c === '6910' || /^(rem_os_|RM-)/i.test(String(codInt || ''))) return 'os';
  return 'outra';
}

/** dd/mm/aaaa ou aaaa-mm-dd → aaaa-mm-dd (ou null) */
export function dataISO(s: string | null | undefined): string | null {
  const t = String(s || '').trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
export function dataBR(iso: string | null | undefined): string {
  const d = dataISO(iso);
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '';
}
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
export function diasEntre(deISO: string, ateISO: string): number {
  return Math.round((Date.parse(`${ateISO}T12:00:00Z`) - Date.parse(`${deISO}T12:00:00Z`)) / 86400000);
}
/** hoje em Brasília (aaaa-mm-dd) */
export function hojeISO(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

export interface EntradaSituacao {
  tipo: TipoRemessa;
  status: string | null;            // status do espelho: Aberta, Faturada, Cancelada, Devolvida, Retorno, Suspeita
  emissao: string | null;
  prazoAte?: string | null;         // remessas_controle.prazo_ate
  manual?: string | null;           // remessas_controle.situacao_manual
}

/** prazo efetivo de uma demonstração: o gravado ou emissão + 30 dias */
export function prazoDe(e: { emissao: string | null; prazoAte?: string | null }): string | null {
  if (e.prazoAte) return dataISO(e.prazoAte);
  const em = dataISO(e.emissao);
  return em ? somarDias(em, PRAZO_PADRAO_DIAS) : null;
}

export function situacaoDe(e: EntradaSituacao, hoje = hojeISO()): Situacao {
  const st = String(e.status || '').toLowerCase();
  if (st === 'cancelada') return 'cancelada';
  if (e.manual === 'virou_venda' || e.manual === 'renovada' || e.manual === 'devolvida') return e.manual;
  if (st === 'devolvida' || st === 'retorno') return 'devolvida';
  if (st === 'suspeita') return 'conferir';
  if (st === 'aberta') return 'sem_nota';
  if (e.tipo !== 'demonstracao') return 'faturada';
  const prazo = prazoDe(e);
  if (!prazo) return 'em_demonstracao';
  const falta = diasEntre(hoje, prazo);
  if (falta < 0) return 'vencida';
  if (falta <= AVISO_DIAS_ANTES) return 'vence_logo';
  return 'em_demonstracao';
}

/** CFOP da volta (nota de entrada) a partir do CFOP da remessa: 5.912 → 1.913, 6.912 → 2.913 */
export function cfopRetornoDemo(cfopRemessa: string | null | undefined): string {
  return dig(cfopRemessa).startsWith('6') ? '2.913' : '1.913';
}
/** CFOP da remessa de demonstração pelo estado do cliente */
export function cfopDemo(ufCliente: string | null | undefined, ufEmpresa = 'SP'): string {
  const uf = String(ufCliente || '').trim().toUpperCase();
  return !uf || uf === ufEmpresa ? '5.912' : '6.912';
}

/** nível de aviso de prazo devido agora (0 nada, 1 vence em ≤5 dias, 2 vencida) — só sobe */
export function avisoDevido(situacao: Situacao, jaAvisado: number): 0 | 1 | 2 {
  const alvo = situacao === 'vencida' ? 2 : situacao === 'vence_logo' ? 1 : 0;
  return alvo > jaAvisado ? (alvo as 1 | 2) : 0;
}

/** código de integração na Omie (idempotência) */
export const codDemo = (n: number | string) => `DEMO-${n}`;
export const codRetorno = (idRemessa: number | string, n: number) => `RET-${idRemessa}-${n}`;

/** remove < > & e aspas (a Omie grava escapado e a NF sai com "&quot;") */
export function limparTexto(s: string): string {
  return String(s || '').replace(/[<>&]/g, ' ').replace(/"/g, "'").replace(/\s+/g, ' ').trim().slice(0, 1800);
}

export function textoDemo(a: { obs?: string | null; prazoAte: string }): string {
  const base = `REMESSA PARA DEMONSTRACAO - RETORNO ATE ${dataBR(a.prazoAte)}`;
  return limparTexto(a.obs ? `${base}. ${a.obs}` : base);
}
export function textoRetorno(a: { nfRemessa?: string | null; emissao?: string | null; obs?: string | null }): string {
  const nf = String(a.nfRemessa || '').replace(/^0+(?=\d)/, '');
  const base = `RETORNO DE MERCADORIA REMETIDA PARA DEMONSTRACAO${nf ? ` CONFORME NF ${nf}` : ''}${a.emissao ? ` DE ${dataBR(a.emissao)}` : ''}`;
  return limparTexto(a.obs ? `${base}. ${a.obs}` : base);
}

// ── Itens da nota ─────────────────────────────────────────────────────────────
/** item como a Omie devolve no ConsultarRemessa / ConsultarNotaEnt */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON cru da Omie
export type ItemOmie = Record<string, any>;

export interface ItemSimples { nCodProd: number; qtd: number; valorUnit: number; descricao?: string | null; localEstoque?: number | null }

const num = (v: unknown) => Number(v) || 0;

/** blocos fiscais copiados de um item-modelo (remessa original ou a última nota do mesmo tipo) */
function fiscalDe(modelo: ItemOmie | null | undefined) {
  const m = modelo || {};
  const out: Record<string, unknown> = {};
  if (m.ICMS) out.ICMS = { cModBC: m.ICMS.cModBC || '3', cOrigem: m.ICMS.cOrigem || '0', cSitTrib: m.ICMS.cSitTrib || '60', nAliq: 0, nBC: 0, nValor: 0 };
  if (m.PIS?.cSitTribPIS) out.PIS = { cSitTribPIS: m.PIS.cSitTribPIS };
  if (m.COFINS?.cSitTribCOFINS) out.COFINS = { cSitTribCOFINS: m.COFINS.cSitTribCOFINS };
  if (m.IPI?.cSitTribIPI) out.IPI = { cSitTribIPI: m.IPI.cSitTribIPI, ...(m.IPI.cEnqIPI ? { cEnqIPI: m.IPI.cEnqIPI } : {}) };
  if (m.IBS_CBS?.cCstIbsCbs) out.IBS_CBS = { cCstIbsCbs: m.IBS_CBS.cCstIbsCbs, cClassTrib: m.IBS_CBS.cClassTrib };
  return out;
}

/**
 * Item da nota de ENTRADA de retorno: o mesmo produto/quantidade/valor/local do item da remessa,
 * CFOP 1.913/2.913, origem e CST do ICMS da remessa, PIS/COFINS/IBS-CBS da última nota de retorno.
 */
export function itemRetorno(itemRemessa: ItemOmie, cfop: string, modeloRetorno?: ItemOmie | null) {
  const f = fiscalDe(modeloRetorno || itemRemessa);
  if (itemRemessa.ICMS) f.ICMS = { ...(f.ICMS as object), cOrigem: itemRemessa.ICMS.cOrigem || '0', cSitTrib: itemRemessa.ICMS.cSitTrib || '60' };
  return {
    nCodProd: num(itemRemessa.nCodProd),
    nQtde: num(itemRemessa.nQtde),
    nValUnit: num(itemRemessa.nValUnit),
    cCFOP: cfop,
    ...(itemRemessa.codigo_local_estoque ? { codigo_local_estoque: num(itemRemessa.codigo_local_estoque) } : {}),
    ...f,
  };
}

/** Item da remessa de DEMONSTRAÇÃO: fiscal copiado do item-modelo (última demonstração da empresa). */
export function itemDemo(it: ItemSimples, cfop: string, modelo?: ItemOmie | null) {
  return {
    nCodProd: it.nCodProd,
    nQtde: it.qtd,
    nValUnit: Math.round(it.valorUnit * 100) / 100,
    cCFOP: cfop,
    ...(it.localEstoque || modelo?.codigo_local_estoque ? { codigo_local_estoque: Number(it.localEstoque || modelo?.codigo_local_estoque) } : {}),
    ...fiscalDe(modelo),
  };
}

export function validarDemo(a: { nCodCli?: number | null; itens: ItemSimples[]; prazoAte?: string | null; hoje?: string }): string[] {
  const erros: string[] = [];
  if (!a.nCodCli) erros.push('Escolha o cliente.');
  if (!a.itens.length) erros.push('Escolha ao menos uma máquina.');
  for (const it of a.itens) {
    if (!it.nCodProd) erros.push(`${it.descricao || 'Item'}: sem produto da Omie.`);
    if (!(it.qtd > 0)) erros.push(`${it.descricao || 'Item'}: quantidade inválida.`);
    if (!(it.valorUnit > 0)) erros.push(`${it.descricao || 'Item'}: informe o valor.`);
  }
  const hoje = a.hoje || hojeISO();
  if (!a.prazoAte || !dataISO(a.prazoAte)) erros.push('Informe o prazo de retorno.');
  else if (dataISO(a.prazoAte)! <= hoje) erros.push('O prazo de retorno tem que ser depois de hoje.');
  return erros;
}

// ── Lista ─────────────────────────────────────────────────────────────────────
export interface LinhaRemessa {
  conta: 'nova' | 'castro';
  idRemessa: number;
  numero: string;
  emissao: string | null;      // aaaa-mm-dd
  cfop: string;
  tipo: TipoRemessa;
  status: string;              // espelho
  situacao: Situacao;
  destinatario: string;
  cnpj: string;
  total: number;
  itens: string[];             // descrições
  prazoAte: string | null;
  diasPrazo: number | null;    // dias até o prazo (negativo = vencido)
  obs: string;
  origemPortal: boolean;
  renovadaDe: number | null;
  renovadaPara: number | null;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function casaBusca(l: LinhaRemessa, q: string): boolean {
  const t = semAcento(q.trim());
  if (!t) return true;
  const d = dig(t);
  const alvo = semAcento([l.numero, l.destinatario, l.cnpj, l.cfop, l.obs, ...l.itens, TIPOS[l.tipo].rotulo, SITUACOES[l.situacao].rotulo].join(' | '));
  if (alvo.includes(t)) return true;
  return d.length >= 3 && (dig(l.numero).replace(/^0+/, '') === d.replace(/^0+/, '') || dig(l.cnpj).includes(d));
}

export function csvRemessas(linhas: LinhaRemessa[]): string {
  const cab = ['Empresa', 'Nº', 'Emissão', 'Tipo', 'Situação', 'CFOP', 'Destinatário', 'CPF/CNPJ', 'Itens', 'Valor', 'Prazo'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = linhas.map((l) => [l.conta.toUpperCase(), l.numero, dataBR(l.emissao), TIPOS[l.tipo].rotulo, SITUACOES[l.situacao].rotulo, l.cfop,
    l.destinatario, l.cnpj, l.itens.join(' / '), l.total.toFixed(2).replace('.', ','), dataBR(l.prazoAte)].map(esc).join(';'));
  return '﻿' + [cab.map(esc).join(';'), ...rows].join('\n');
}
