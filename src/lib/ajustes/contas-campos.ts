// Correção de contas — campos editáveis ALÉM de categoria/departamento
// (vencimento, previsão de pagamento, projeto, conta corrente, nº do documento,
// observação). Regras PURAS: validação do que a tela manda, diff contra o título
// como está na Omie (ConsultarConta*) e tradução para os parâmetros do
// AlterarContaPagar/Receber, para o espelho (contas_pagar/receber) e para o `raw`.
// Nada de banco nem de Omie aqui — testado em contas-campos.test.ts.

export type CampoEditavel = 'dataVencimento' | 'dataPrevisao' | 'codigoProjeto' | 'idContaCorrente' | 'numeroDocumento' | 'observacao';

export interface CamposCorrecao {
  dataVencimento?: string | null;   // ISO YYYY-MM-DD
  dataPrevisao?: string | null;     // ISO YYYY-MM-DD
  codigoProjeto?: number | null;    // código do projeto na Omie
  idContaCorrente?: number | null;  // nCodCC da conta corrente
  numeroDocumento?: string | null;
  observacao?: string | null;       // '' limpa a observação
}

export const CAMPOS_EDITAVEIS: CampoEditavel[] = ['dataVencimento', 'dataPrevisao', 'codigoProjeto', 'idContaCorrente', 'numeroDocumento', 'observacao'];

export const ROTULO_CAMPO: Record<CampoEditavel, string> = {
  dataVencimento: 'Vencimento',
  dataPrevisao: 'Previsão de pagamento',
  codigoProjeto: 'Projeto',
  idContaCorrente: 'Conta corrente',
  numeroDocumento: 'Nº do documento',
  observacao: 'Observação',
};

/** Nome do parâmetro no AlterarContaPagar/Receber e no registro do ConsultarConta*. */
export const CAMPO_OMIE: Record<CampoEditavel, string> = {
  dataVencimento: 'data_vencimento',
  dataPrevisao: 'data_previsao',
  codigoProjeto: 'codigo_projeto',
  idContaCorrente: 'id_conta_corrente',
  numeroDocumento: 'numero_documento',
  observacao: 'observacao',
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const BR = /^(\d{2})\/(\d{2})\/(\d{4})/;

export function isoParaBR(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function brParaISO(br: unknown): string | null {
  const m = BR.exec(String(br || ''));
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const s = String(br || '').slice(0, 10);
  return ISO.test(s) ? s : null;
}

function dataValida(iso: string): boolean {
  if (!ISO.test(iso)) return false;
  const d = new Date(iso + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso && iso >= '2000-01-01' && iso <= '2100-12-31';
}

/** Lê o que a tela mandou: só as chaves presentes entram; valida formato e tamanho.
 *  String vazia em data/projeto/conta/nº documento = "não mexer"; em observação = limpar. */
export function normalizarCampos(entrada: unknown): { campos: CamposCorrecao; erro?: string } {
  const campos: CamposCorrecao = {};
  if (!entrada || typeof entrada !== 'object') return { campos };
  const e = entrada as Record<string, unknown>;
  for (const k of ['dataVencimento', 'dataPrevisao'] as const) {
    if (e[k] == null || e[k] === '') continue;
    const v = String(e[k]).slice(0, 10);
    if (!dataValida(v)) return { campos, erro: `${ROTULO_CAMPO[k]}: data inválida (${String(e[k])})` };
    campos[k] = v;
  }
  for (const k of ['codigoProjeto', 'idContaCorrente'] as const) {
    if (e[k] == null || e[k] === '') continue;
    const n = Number(e[k]);
    if (!Number.isInteger(n) || n <= 0) return { campos, erro: `${ROTULO_CAMPO[k]}: código inválido (${String(e[k])})` };
    campos[k] = n;
  }
  if (e.numeroDocumento != null && String(e.numeroDocumento).trim() !== '') {
    const v = String(e.numeroDocumento).trim();
    if (v.length > 60) return { campos, erro: 'Nº do documento: no máximo 60 caracteres' };
    campos.numeroDocumento = v;
  }
  if (e.observacao != null) {
    const v = String(e.observacao).trim();
    if (v.length > 1000) return { campos, erro: 'Observação: no máximo 1000 caracteres' };
    campos.observacao = v; // '' = limpar
  }
  return { campos };
}

export function temCampos(c: CamposCorrecao | null | undefined): boolean {
  return !!c && CAMPOS_EDITAVEIS.some((k) => c[k] !== undefined);
}

/** O título como está na Omie (registro do ConsultarContaPagar/Receber) nos mesmos nomes da tela. */
export function camposDoOmie(atual: Record<string, unknown> | null | undefined): CamposCorrecao {
  const a = atual || {};
  const num = (v: unknown) => (v == null || v === '' || Number(v) === 0 ? null : Number(v));
  return {
    dataVencimento: brParaISO(a.data_vencimento),
    dataPrevisao: brParaISO(a.data_previsao),
    codigoProjeto: num(a.codigo_projeto),
    idContaCorrente: num(a.id_conta_corrente),
    numeroDocumento: a.numero_documento == null ? null : String(a.numero_documento),
    observacao: a.observacao == null ? '' : String(a.observacao),
  };
}

/** Só o que realmente muda em relação ao título atual, com o valor anterior de cada campo. */
export function diffCampos(atual: CamposCorrecao, novos: CamposCorrecao): { mudou: CamposCorrecao; anterior: CamposCorrecao } {
  const mudou: CamposCorrecao = {};
  const anterior: CamposCorrecao = {};
  for (const k of CAMPOS_EDITAVEIS) {
    if (novos[k] === undefined) continue;
    const de = atual[k] ?? (k === 'observacao' ? '' : null);
    const para = novos[k] ?? (k === 'observacao' ? '' : null);
    if (de === para) continue;
    (mudou as Record<string, unknown>)[k] = para;
    (anterior as Record<string, unknown>)[k] = de;
  }
  return { mudou, anterior };
}

/** Parâmetros extras do AlterarContaPagar/Receber (datas em DD/MM/YYYY). */
export function paramsOmieCampos(mudou: CamposCorrecao): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (mudou.dataVencimento) p.data_vencimento = isoParaBR(mudou.dataVencimento);
  if (mudou.dataPrevisao) p.data_previsao = isoParaBR(mudou.dataPrevisao);
  if (mudou.codigoProjeto) p.codigo_projeto = mudou.codigoProjeto;
  if (mudou.idContaCorrente) p.id_conta_corrente = mudou.idContaCorrente;
  if (mudou.numeroDocumento) p.numero_documento = mudou.numeroDocumento;
  if (mudou.observacao !== undefined) p.observacao = mudou.observacao;
  return p;
}

/** Colunas do espelho contas_pagar/receber a regravar depois do sucesso na Omie. */
export function updateEspelhoCampos(mudou: CamposCorrecao): Record<string, unknown> {
  const u: Record<string, unknown> = {};
  if (mudou.dataVencimento) u.data_vencimento = mudou.dataVencimento;
  if (mudou.dataPrevisao) u.data_previsao = mudou.dataPrevisao;
  if (mudou.numeroDocumento) u.numero_documento = mudou.numeroDocumento;
  if (mudou.observacao !== undefined) u.observacao = mudou.observacao;
  return u;
}

/** `raw` do espelho (registro da Omie) com os campos alterados — projeto e conta
 *  corrente só existem ali; o sync seguinte traz o oficial. */
export function rawComCampos(raw: Record<string, unknown> | null | undefined, mudou: CamposCorrecao): Record<string, unknown> {
  return { ...(raw || {}), ...paramsOmieCampos(mudou) };
}
