// Alteração em massa de cadastros do Omie (conta NOVA) — usado pelas rotas
// /api/omie-massa/*. Mesma lógica dos scripts scripts/servicos-omie-*.ts e
// scripts/produtos-omie-*.ts, mas lendo credenciais do process.env.
//
// Serviços: AlterarCadastroServico exige o registro completo → o diff faz
// merge (atual + edições). O campo "inativo" de serviço é SÓ LEITURA na API;
// tentamos enviar e o chamador verifica depois se pegou.
// Produtos: AlterarProduto altera apenas os campos enviados; "inativo" é editável.

import { decodeOmieTexto } from '@/lib/omie/texto';

const OMIE_SERV_URL = 'https://app.omie.com.br/api/v1/servicos/servico/';
const OMIE_PROD_URL = 'https://app.omie.com.br/api/v1/geral/produtos/';
export const PAUSA_MS = 150; // entre chamadas, p/ rate limit do Omie

export const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function omieCall<T>(url: string, call: string, param: object): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      call,
      app_key: process.env.OMIE_APP_KEY || process.env.OMIE_APP_KEY_NOVA || '',
      app_secret: process.env.OMIE_APP_SECRET || process.env.OMIE_APP_SECRET_NOVA || '',
      param: [param],
    }),
  });
  const json = await res.json();
  if (json.faultstring) throw new Error(String(json.faultstring));
  return json as T;
}

export const omieServicoCall = <T,>(call: string, param: object) => omieCall<T>(OMIE_SERV_URL, call, param);
export const omieProdutoCall = <T,>(call: string, param: object) => omieCall<T>(OMIE_PROD_URL, call, param);

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

export async function listarTodosServicos(): Promise<ServicoOmie[]> {
  const servicos: ServicoOmie[] = [];
  let pagina = 1;
  let totPaginas = 1;
  do {
    const r = await omieServicoCall<{ nTotPaginas: number; cadastros?: ServicoOmie[] }>(
      'ListarCadastroServico', { nPagina: pagina, nRegPorPagina: 50 },
    );
    totPaginas = r.nTotPaginas;
    servicos.push(...(r.cadastros || []));
    pagina++;
    if (pagina <= totPaginas) await pausa(PAUSA_MS);
  } while (pagina <= totPaginas);
  return servicos;
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
}

export const CAMPOS_PROD_TXT = ['descricao', 'descr_detalhada', 'ncm', 'ean', 'unidade'] as const;

export function diffProduto(row: Partial<ProdutoOmie> & { inativo?: string }, atual: ProdutoOmie): { payload: Record<string, string | number>; mudancas: MudancaCampo[] } {
  const payload: Record<string, string | number> = { codigo_produto: Number(atual.codigo_produto) };
  const mudancas: MudancaCampo[] = [];
  for (const c of CAMPOS_PROD_TXT) {
    const para = row[c];
    const atualTxt = decodeOmieTexto(atual[c] ?? '');  // a API devolve escapado; o front trabalha decodificado
    if (para !== undefined && String(para).trim() !== atualTxt) {
      payload[c] = String(para).trim();
      mudancas.push({ campo: c, de: atualTxt, para: String(para).trim() });
    }
  }
  if (row.valor_unitario !== undefined && Number(row.valor_unitario) !== Number(atual.valor_unitario ?? 0)) {
    payload.valor_unitario = Number(row.valor_unitario);
    mudancas.push({ campo: 'valor_unitario', de: Number(atual.valor_unitario ?? 0), para: Number(row.valor_unitario) });
  }
  if (row.inativo !== undefined && String(row.inativo).toUpperCase() !== (atual.inativo ?? 'N')) {
    payload.inativo = String(row.inativo).toUpperCase();
    mudancas.push({ campo: 'inativo', de: atual.inativo ?? 'N', para: String(row.inativo).toUpperCase() });
  }
  return { payload, mudancas };
}
