// Alteração em massa de cadastros do Omie (conta NOVA ou CASTRO) — usado pelas
// rotas /api/omie-massa/*. Mesma lógica dos scripts scripts/servicos-omie-*.ts
// e scripts/produtos-omie-*.ts, com as credenciais vindo de lib/estoque/conta.
//
// Serviços: AlterarCadastroServico exige o registro completo → o diff faz
// merge (atual + edições). O campo "inativo" de serviço é SÓ LEITURA na API;
// tentamos enviar e o chamador verifica depois se pegou.
// Produtos: AlterarProduto altera apenas os campos de TOPO enviados e "inativo"
// é editável — MAS o bloco aninhado `recomendacoes_fiscais` (CEST/Origem) é
// IGNORADO EM SILÊNCIO se vier parcial: tem que ir completo. Medido em
// 22/07/2026 (enviar só { origem_mercadoria } retorna sucesso e não grava).

import { decodeOmieTexto } from '@/lib/omie/texto';
import { getCredentials, CONTA_DEFAULT, type Conta } from '@/lib/estoque/conta';

const OMIE_SERV_URL = 'https://app.omie.com.br/api/v1/servicos/servico/';
const OMIE_PROD_URL = 'https://app.omie.com.br/api/v1/geral/produtos/';
const OMIE_LOCAL_URL = 'https://app.omie.com.br/api/v1/estoque/local/';
export const PAUSA_MS = 150; // entre chamadas, p/ rate limit do Omie

export const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `?conta=NOVA|CASTRO` das rotas — default NOVA (comportamento anterior do módulo). */
export const contaDaQuery = (raw: string | null | undefined): Conta =>
  (String(raw || '').toUpperCase() === 'CASTRO' ? 'CASTRO' : CONTA_DEFAULT);
/** conta_omie na tabela `produtos` é MINÚSCULA; o tipo Conta é MAIÚSCULO. */
export const contaLow = (c: Conta): string => String(c).toLowerCase();

// Credenciais por conta (NOVA/CASTRO) vêm de lib/estoque/conta — mesma fonte do
// resto do portal. Sem `conta`, cai na CONTA_DEFAULT (NOVA), como era antes.
async function omieCall<T>(url: string, call: string, param: object, conta: Conta = CONTA_DEFAULT): Promise<T> {
  const { appKey, appSecret } = getCredentials(conta);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call, app_key: appKey, app_secret: appSecret, param: [param] }),
  });
  const json = await res.json();
  if (json.faultstring) throw new Error(String(json.faultstring));
  return json as T;
}

export const omieServicoCall = <T,>(call: string, param: object, conta?: Conta) => omieCall<T>(OMIE_SERV_URL, call, param, conta);
export const omieProdutoCall = <T,>(call: string, param: object, conta?: Conta) => omieCall<T>(OMIE_PROD_URL, call, param, conta);
export const omieLocalCall = <T,>(call: string, param: object, conta?: Conta) => omieCall<T>(OMIE_LOCAL_URL, call, param, conta);

// ---------------- Serviços ----------------

export interface ServicoOmie {
  cabecalho: {
    cCodigo: string; cDescricao: string; cIdTrib: string; nPrecoUnit: number;
    cCodLC116: string; cCodServMun: string; cCodCateg: string;
  };
  descricao: { cDescrCompleta: string };
  impostos: Record<string, string | number | boolean>;
  info: { inativo: 'S' | 'N' };
  intListar: { nCodServ: number };
}

// Linha "achatada" trocada com o frontend (mesmas colunas do CSV dos scripts)
export interface ServicoRow {
  nCodServ: number; inativo: string;
  cCodigo: string; cDescricao: string; cDescrCompleta: string;
  nPrecoUnit: number; cIdTrib: string; cCodLC116: string; cCodServMun: string; cCodCateg: string;
  nAliqISS: number; cRetISS: string; nAliqPIS: number; cRetPIS: string;
  nAliqCOFINS: number; cRetCOFINS: string; nAliqCSLL: number; cRetCSLL: string;
  nAliqIR: number; cRetIR: string; nAliqINSS: number; cRetINSS: string;
  // Reforma Tributária (IBS/CBS)
  cCstIbsCbs: string; cClassTrib: string; cIndOper: string;
  nAliqIbsMun: number; nAliqIbsUf: number; nAliqCbs: number;
  nPercReducaoIbsMun: number; nPercReducaoIbsUf: number; nPercReducaoCbs: number;
}

export const CAMPOS_SERV_CABECALHO = ['cCodigo', 'cDescricao', 'cIdTrib', 'cCodLC116', 'cCodServMun', 'cCodCateg'] as const;
export const CAMPOS_SERV_ALIQ = [
  'nAliqISS', 'nAliqPIS', 'nAliqCOFINS', 'nAliqCSLL', 'nAliqIR', 'nAliqINSS',
  'nAliqIbsMun', 'nAliqIbsUf', 'nAliqCbs', 'nPercReducaoIbsMun', 'nPercReducaoIbsUf', 'nPercReducaoCbs',
] as const;
export const CAMPOS_SERV_RET = ['cRetISS', 'cRetPIS', 'cRetCOFINS', 'cRetCSLL', 'cRetIR', 'cRetINSS'] as const;
// Campos texto da Reforma Tributária (vivem em impostos, mas não são S/N)
export const CAMPOS_SERV_REFORMA_TXT = ['cCstIbsCbs', 'cClassTrib', 'cIndOper'] as const;

export async function listarTodosServicos(conta?: Conta): Promise<ServicoOmie[]> {
  const servicos: ServicoOmie[] = [];
  let pagina = 1;
  let totPaginas = 1;
  do {
    const r = await omieServicoCall<{ nTotPaginas: number; cadastros?: ServicoOmie[] }>(
      'ListarCadastroServico', { nPagina: pagina, nRegPorPagina: 50 }, conta,
    );
    totPaginas = r.nTotPaginas;
    servicos.push(...(r.cadastros || []));
    pagina++;
    if (pagina <= totPaginas) await pausa(PAUSA_MS);
  } while (pagina <= totPaginas);
  return servicos;
}

// ---- Produtos Utilizados (aba do cadastro de serviço no Omie) ----
// O ListarCadastroServico NÃO devolve a composição; só o ConsultarCadastroServico
// (consulta individual) traz o bloco produtosUtilizados.

export interface ProdutoUtilizadoOmie {
  nCodProdutoPU: number;   // codigo_produto do cadastro de produtos
  nQtdePU: number;
  nIdItemPU: number;
  codigo_local_estoque: number;
}

export interface ServicoConsultaOmie extends ServicoOmie {
  produtosUtilizados?: {
    cAtualizarProdutos?: 'S' | 'N';
    produtoUtilizado?: ProdutoUtilizadoOmie[];
  } | null;
}

export const consultarServico = (nCodServ: number, conta?: Conta) =>
  omieServicoCall<ServicoConsultaOmie>('ConsultarCadastroServico', { nCodServ }, conta);

// Mapa codigo_local_estoque → descrição ("Estoque Balcão" etc.)
export async function listarLocaisEstoque(conta?: Conta): Promise<Map<number, string>> {
  const locais = new Map<number, string>();
  let pagina = 1;
  let totPaginas = 1;
  do {
    const r = await omieLocalCall<{ nTotPaginas: number; locaisEncontrados?: Array<{ codigo_local_estoque: number; descricao: string }> }>(
      'ListarLocaisEstoque', { nPagina: pagina, nRegPorPagina: 50 }, conta,
    );
    totPaginas = r.nTotPaginas;
    for (const l of r.locaisEncontrados || []) locais.set(Number(l.codigo_local_estoque), decodeOmieTexto(l.descricao));
    pagina++;
    if (pagina <= totPaginas) await pausa(PAUSA_MS);
  } while (pagina <= totPaginas);
  return locais;
}

export function servicoParaRow(s: ServicoOmie): ServicoRow {
  const imp = s.impostos || {};
  return {
    nCodServ: s.intListar.nCodServ,
    inativo: s.info?.inativo ?? 'N',
    cCodigo: s.cabecalho.cCodigo ?? '',
    cDescricao: decodeOmieTexto(s.cabecalho.cDescricao ?? ''),
    cDescrCompleta: decodeOmieTexto(s.descricao?.cDescrCompleta ?? ''),
    nPrecoUnit: Number(s.cabecalho.nPrecoUnit ?? 0),
    cIdTrib: s.cabecalho.cIdTrib ?? '',
    cCodLC116: s.cabecalho.cCodLC116 ?? '',
    cCodServMun: s.cabecalho.cCodServMun ?? '',
    cCodCateg: s.cabecalho.cCodCateg ?? '',
    nAliqISS: Number(imp.nAliqISS ?? 0), cRetISS: String(imp.cRetISS ?? 'N'),
    nAliqPIS: Number(imp.nAliqPIS ?? 0), cRetPIS: String(imp.cRetPIS ?? 'N'),
    nAliqCOFINS: Number(imp.nAliqCOFINS ?? 0), cRetCOFINS: String(imp.cRetCOFINS ?? 'N'),
    nAliqCSLL: Number(imp.nAliqCSLL ?? 0), cRetCSLL: String(imp.cRetCSLL ?? 'N'),
    nAliqIR: Number(imp.nAliqIR ?? 0), cRetIR: String(imp.cRetIR ?? 'N'),
    nAliqINSS: Number(imp.nAliqINSS ?? 0), cRetINSS: String(imp.cRetINSS ?? 'N'),
    cCstIbsCbs: String(imp.cCstIbsCbs ?? ''), cClassTrib: String(imp.cClassTrib ?? ''), cIndOper: String(imp.cIndOper ?? ''),
    nAliqIbsMun: Number(imp.nAliqIbsMun ?? 0), nAliqIbsUf: Number(imp.nAliqIbsUf ?? 0), nAliqCbs: Number(imp.nAliqCbs ?? 0),
    nPercReducaoIbsMun: Number(imp.nPercReducaoIbsMun ?? 0), nPercReducaoIbsUf: Number(imp.nPercReducaoIbsUf ?? 0), nPercReducaoCbs: Number(imp.nPercReducaoCbs ?? 0),
  };
}

export interface MudancaCampo { campo: string; de: string | number; para: string | number }

// Diff de uma linha editada vs o estado atual do Omie
export function diffServico(row: Partial<ServicoRow>, atual: ServicoOmie): MudancaCampo[] {
  const flat = servicoParaRow(atual);
  const m: MudancaCampo[] = [];
  for (const c of [...CAMPOS_SERV_CABECALHO, 'cDescrCompleta', ...CAMPOS_SERV_RET, ...CAMPOS_SERV_REFORMA_TXT, 'inativo'] as const) {
    const para = row[c];
    if (para !== undefined && String(para).trim() !== String(flat[c])) m.push({ campo: c, de: flat[c], para: String(para).trim() });
  }
  for (const c of ['nPrecoUnit', ...CAMPOS_SERV_ALIQ] as const) {
    const para = row[c];
    if (para !== undefined && Number(para) !== Number(flat[c])) m.push({ campo: c, de: flat[c], para: Number(para) });
  }
  return m;
}

// Payload do AlterarCadastroServico: registro completo (atual + edições)
export function payloadServico(row: Partial<ServicoRow>, atual: ServicoOmie, mudancas: MudancaCampo[]) {
  const flat = servicoParaRow(atual);
  const v = <K extends keyof ServicoRow>(c: K): ServicoRow[K] => (row[c] !== undefined ? (row[c] as ServicoRow[K]) : flat[c]);
  const impostos: Record<string, string | number | boolean> = { ...(atual.impostos || {}) };
  for (const c of CAMPOS_SERV_ALIQ) impostos[c] = Number(v(c));
  for (const c of CAMPOS_SERV_RET) impostos[c] = String(v(c)).toUpperCase();
  for (const c of CAMPOS_SERV_REFORMA_TXT) impostos[c] = String(v(c)).trim();
  const payload: Record<string, unknown> = {
    intEditar: { nCodServ: atual.intListar.nCodServ },
    cabecalho: {
      cCodigo: v('cCodigo'), cDescricao: v('cDescricao'), cIdTrib: v('cIdTrib'),
      cCodLC116: v('cCodLC116'), cCodServMun: v('cCodServMun'), cCodCateg: v('cCodCateg'),
      nPrecoUnit: Number(v('nPrecoUnit')),
    },
    descricao: { cDescrCompleta: v('cDescrCompleta') },
    impostos,
  };
  if (mudancas.some((mu) => mu.campo === 'inativo')) payload.info = { inativo: String(row.inativo).toUpperCase() };
  return payload;
}

// ---------------- Produtos ----------------

// Bloco "Recomendações fiscais" do cadastro. É ONDE MORAM o CEST e a Origem de
// verdade — os campos de topo `cest` e `origem_imposto` vêm sempre vazios da
// Omie e `origem_imposto` nem sequer é gravável (medido em 22/07/2026).
export interface RecomendacoesFiscais {
  id_cest?: string;
  origem_mercadoria?: string;
  cnpj_fabricante?: string;
  indicador_escala?: string;
  cupom_fiscal?: string;
  market_place?: string;
  id_preco_tabelado?: number;
}

export interface ProdutoOmie {
  codigo_produto: number;
  codigo: string;
  descricao: string;
  descr_detalhada: string;
  valor_unitario: number;
  ncm: string;
  ean: string;
  unidade: string;
  inativo: 'S' | 'N';
  tipoItem: string;
  recomendacoes_fiscais?: RecomendacoesFiscais | null;
  // Classificação fiscal
  cest: string;      // fantasma: sempre vazio; o valor real é recomendacoes_fiscais.id_cest
  cfop: string;
  // ICMS/PIS/COFINS (clássicos)
  cst_icms: string;
  modalidade_icms: string;   // só o ConsultarProduto devolve (ListarProdutos não)
  csosn_icms: string;
  aliquota_icms: number;
  red_base_icms: number;
  motivo_deson_icms: string;
  per_icms_fcp: number;
  codigo_beneficio: string;
  cst_pis: string;
  aliquota_pis: number;
  red_base_pis: number;
  cst_cofins: string;
  aliquota_cofins: number;
  red_base_cofins: number;
  // Reforma Tributária (IBS/CBS)
  cst_ibs_cbs: string;
  class_trib: string;
  aliquota_ibs_mun: number;
  aliquota_ibs_uf: number;
  aliquota_cbs: number;
  perc_reducao_ibs_mun: number;
  perc_reducao_ibs_uf: number;
  perc_reducao_cbs: number;
}

// Campos de TOPO graváveis. `cest` NÃO entra aqui de propósito (é o fantasma);
// CEST e Origem são tratados à parte, dentro de recomendacoes_fiscais.
export const CAMPOS_PROD_TXT = [
  'descricao', 'descr_detalhada', 'ncm', 'ean', 'unidade', 'tipoItem',
  'cfop', 'cst_icms', 'modalidade_icms', 'csosn_icms', 'motivo_deson_icms',
  'codigo_beneficio', 'cst_pis', 'cst_cofins', 'cst_ibs_cbs', 'class_trib',
] as const;
export const CAMPOS_PROD_NUM = [
  'valor_unitario', 'aliquota_icms', 'red_base_icms', 'per_icms_fcp',
  'aliquota_pis', 'red_base_pis', 'aliquota_cofins', 'red_base_cofins',
  'aliquota_ibs_mun', 'aliquota_ibs_uf', 'aliquota_cbs',
  'perc_reducao_ibs_mun', 'perc_reducao_ibs_uf', 'perc_reducao_cbs',
] as const;

// Chaves que o frontend usa para os dois campos aninhados, mapeadas para dentro
// de recomendacoes_fiscais.
export const CAMPOS_PROD_REC: Array<{ chave: 'cest' | 'origem_mercadoria'; dentro: keyof RecomendacoesFiscais }> = [
  { chave: 'cest', dentro: 'id_cest' },
  { chave: 'origem_mercadoria', dentro: 'origem_mercadoria' },
];

/** CEST real de um produto (o campo de topo é sempre vazio). */
export const cestDe = (p: { cest?: string; recomendacoes_fiscais?: RecomendacoesFiscais | null }) =>
  String(p.recomendacoes_fiscais?.id_cest ?? '').trim();
/** Origem da mercadoria (0–8). Vive só dentro de recomendacoes_fiscais. */
export const origemDe = (p: { recomendacoes_fiscais?: RecomendacoesFiscais | null }) =>
  String(p.recomendacoes_fiscais?.origem_mercadoria ?? '').trim();

export function diffProduto(
  row: Partial<ProdutoOmie> & { inativo?: string; cest?: string; origem_mercadoria?: string },
  atual: ProdutoOmie,
): { payload: Record<string, unknown>; mudancas: MudancaCampo[] } {
  const payload: Record<string, unknown> = { codigo_produto: Number(atual.codigo_produto) };
  const mudancas: MudancaCampo[] = [];
  for (const c of CAMPOS_PROD_TXT) {
    const para = row[c];
    const atualTxt = decodeOmieTexto(atual[c] ?? '');  // a API devolve escapado; o front trabalha decodificado
    if (para !== undefined && String(para).trim() !== atualTxt) {
      payload[c] = String(para).trim();
      mudancas.push({ campo: c, de: atualTxt, para: String(para).trim() });
    }
  }
  for (const c of CAMPOS_PROD_NUM) {
    const para = row[c];
    if (para !== undefined && Number(para) !== Number(atual[c] ?? 0)) {
      payload[c] = Number(para);
      mudancas.push({ campo: c, de: Number(atual[c] ?? 0), para: Number(para) });
    }
  }

  // Aninhados (CEST / Origem). GOTCHA MEDIDO: a Omie IGNORA EM SILÊNCIO um
  // recomendacoes_fiscais parcial — devolve sucesso e não grava nada. O bloco
  // tem que ir SEMPRE completo, partindo do atual. (22/07/2026)
  const recAtual: RecomendacoesFiscais = { ...(atual.recomendacoes_fiscais || {}) };
  const recNovo: RecomendacoesFiscais = { ...recAtual };
  let mexeuNoRec = false;
  for (const { chave, dentro } of CAMPOS_PROD_REC) {
    const para = row[chave];
    if (para === undefined) continue;
    const de = String(recAtual[dentro] ?? '').trim();
    const novo = String(para).trim();
    if (novo !== de) {
      (recNovo as Record<string, unknown>)[dentro] = novo;
      mudancas.push({ campo: chave, de, para: novo });
      mexeuNoRec = true;
    }
  }
  if (mexeuNoRec) payload.recomendacoes_fiscais = recNovo;

  if (row.inativo !== undefined && String(row.inativo).toUpperCase() !== (atual.inativo ?? 'N')) {
    payload.inativo = String(row.inativo).toUpperCase();
    mudancas.push({ campo: 'inativo', de: atual.inativo ?? 'N', para: String(row.inativo).toUpperCase() });
  }
  return { payload, mudancas };
}
