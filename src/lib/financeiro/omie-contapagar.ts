// =====================================================================
// INTEGRAÇÃO OMIE — CONTAS A PAGAR (módulo Financeiro)
// Cria lançamentos em /api/v1/financas/contapagar/ a partir de finan_pagar.
//
// ⚠️ Segurança contra o bug de "sobrescrever outras OS": NUNCA usamos
//    UpsertContaPagar nem AlterarContaPagar, e NUNCA mutamos o
//    codigo_lancamento_integracao. Ele é sempre derivado de forma estável
//    do id do registro finan_pagar (FP-<id> / FP-<id>-P<n>). Se o Omie
//    disser que já existe, consultamos o lançamento existente e o
//    devolvemos (idempotência) — não criamos duplicata nem alteramos nada.
// =====================================================================

import { createHash } from "crypto";

const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";

// --- Contas Omie (mesma lista usada em src/lib/ppv/omie.ts e src/lib/pos/sync-omie.ts) ---
export interface OmieAccount {
  name: string;
  key: string;
  secret: string;
  codCC: number; // conta corrente padrão da empresa
}

export const OMIE_ACCOUNTS: OmieAccount[] = [
  { name: "Nova Tratores", key: "2729522270475", secret: "113d785bb86c48d064889d4d73348131", codCC: 1969919780 },
  { name: "Castro Peças", key: "2730028269969", secret: "dc270bf5348b40d3ed1398ef70beb628", codCC: 5335855842 },
];

export function getAccount(empresa?: string): OmieAccount {
  const alvo = (empresa || "").trim().toLowerCase();
  return (
    OMIE_ACCOUNTS.find((a) => a.name.toLowerCase() === alvo) ||
    OMIE_ACCOUNTS[0] // fallback: Nova Tratores
  );
}

// --- Client genérico Omie (aceita credenciais por conta) ---
export class OmieError extends Error {
  faultcode?: string;
  constructor(message: string, faultcode?: string) {
    super(message);
    this.name = "OmieError";
    this.faultcode = faultcode;
  }
}

async function omieCall<T>(
  endpoint: string,
  call: string,
  param: Record<string, unknown>,
  acc: OmieAccount,
): Promise<T> {
  const response = await fetch(`${OMIE_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });

  // Rate limit: checar ANTES de parsear JSON (429 pode não retornar JSON válido)
  if (response.status === 429) {
    console.warn(`[Omie ${acc.name}] Rate limit (${call}) — aguardando 30s...`);
    await new Promise((r) => setTimeout(r, 30000));
    return omieCall(endpoint, call, param, acc);
  }

  const data = await response.json().catch(() => ({}));

  if (data?.faultstring) {
    throw new OmieError(`Omie [${data.faultcode}]: ${data.faultstring}`, String(data.faultcode || ""));
  }

  return data as T;
}

function isJaCadastrado(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("já cadastrad") ||
    msg.includes("ja cadastrad") ||
    msg.includes("já existe") ||
    msg.includes("ja existe") ||
    msg.includes("client-103") || // código de integração duplicado (clientes)
    msg.includes("sentry-103") || // código de integração duplicado (financeiro)
    msg.includes("já está cadastrad")
  );
}

// Omie devolve fault 5113 ("Não existem registros para a página [1]") quando um
// Listar/Consultar com filtro não acha nada — não é erro, é "lista vazia".
function isSemRegistros(err: unknown): boolean {
  if (err instanceof OmieError && (err.faultcode || "").includes("5113")) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes("não existem registros") || msg.includes("nao existem registros") || msg.includes("-5113");
}

// =====================================================================
// HELPERS DE FORMATAÇÃO
// =====================================================================

export function soDigitos(v: string | null | undefined): string {
  return String(v || "").replace(/\D/g, "");
}

/** "2026-02-26" | "2026-02-26T00:00:00Z" | "26/02/2026" → "26/02/2026" */
export function dataParaOmie(data: string | null | undefined): string {
  if (!data) return "";
  const s = String(data).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

/** "1.234,56" | "1234,56" | "1234.56" | "R$ 1.234,56" → 1234.56 */
export function parseValor(v: string | number | null | undefined): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  if (s.includes(".") && s.includes(",")) {
    // formato brasileiro: ponto = milhar, vírgula = decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/** Extrai DDD + número de um telefone em formato livre. Retorna {} se não der pra interpretar. */
function parseTelefone(numero: string | null | undefined): { ddd?: string; num?: string } {
  const d = soDigitos(numero);
  if (d.length === 10 || d.length === 11) return { ddd: d.slice(0, 2), num: d.slice(2) };
  return {};
}

// =====================================================================
// FORNECEDOR — buscar no Omie por CNPJ/CPF; criar se não existir
// =====================================================================

const cacheFornecedor = new Map<string, number>(); // `${acc.name}:${doc}` -> codigo_cliente_omie

export interface DadosFornecedor {
  nome: string;
  documento: string; // CNPJ ou CPF (com ou sem máscara)
  telefone?: string;
  fornecedorId?: number | string; // id na tabela Fornecedores (para codigo_cliente_integracao estável)
  email?: string;
}

async function listarClientePorDoc(doc: string, acc: OmieAccount): Promise<number | null> {
  try {
    const r = await omieCall<{ clientes_cadastro?: Array<{ codigo_cliente_omie: number }> }>(
      "/geral/clientes/",
      "ListarClientes",
      { pagina: 1, registros_por_pagina: 1, clientesFiltro: { cnpj_cpf: doc } },
      acc,
    );
    return r?.clientes_cadastro?.[0]?.codigo_cliente_omie || null;
  } catch (err) {
    // fornecedor ainda não existe no Omie: o filtro devolve fault 5113 → trata como "não achou"
    if (isSemRegistros(err)) return null;
    throw err;
  }
}

export async function buscarOuCriarFornecedorOmie(dados: DadosFornecedor, acc: OmieAccount): Promise<number> {
  const doc = soDigitos(dados.documento);
  if (!doc) throw new Error("Fornecedor sem CNPJ/CPF — cadastre o documento do fornecedor antes de enviar para o Omie.");

  const cacheKey = `${acc.name}:${doc}`;
  const cached = cacheFornecedor.get(cacheKey);
  if (cached) return cached;

  // 1) já existe no Omie? (busca por documento)
  const existente = await listarClientePorDoc(doc, acc);
  if (existente) {
    cacheFornecedor.set(cacheKey, existente);
    return existente;
  }

  // 2) criar fornecedor no Omie
  const pessoaFisica = doc.length === 11 ? "S" : "N";
  const { ddd, num } = parseTelefone(dados.telefone);
  const codigoIntegracao = dados.fornecedorId ? `FORN-${dados.fornecedorId}` : `FORN-${doc}`;
  const nome = (dados.nome || "FORNECEDOR").trim().slice(0, 100);

  const param: Record<string, unknown> = {
    codigo_cliente_integracao: codigoIntegracao,
    razao_social: nome,
    nome_fantasia: nome,
    cnpj_cpf: dados.documento,
    pessoa_fisica: pessoaFisica,
    inativo: "N",
    tags: [{ tag: "Fornecedor" }],
  };
  if (ddd && num) {
    param.telefone1_ddd = ddd;
    param.telefone1_numero = num;
  }
  if (dados.email) param.email = dados.email;

  try {
    const r = await omieCall<{ codigo_cliente_omie?: number }>("/geral/clientes/", "IncluirCliente", param, acc);
    if (r?.codigo_cliente_omie) {
      cacheFornecedor.set(cacheKey, r.codigo_cliente_omie);
      return r.codigo_cliente_omie;
    }
  } catch (err) {
    if (!isJaCadastrado(err)) throw err;
    // corrida / já existia: tenta achar de novo
  }

  // 3) fallback: consultar pelo documento ou pelo código de integração
  const recheck =
    (await listarClientePorDoc(doc, acc)) ??
    (await omieCall<{ codigo_cliente_omie?: number }>(
      "/geral/clientes/",
      "ConsultarCliente",
      { codigo_cliente_integracao: codigoIntegracao },
      acc,
    ).then((r) => r?.codigo_cliente_omie || null).catch(() => null));

  if (recheck) {
    cacheFornecedor.set(cacheKey, recheck);
    return recheck;
  }
  throw new Error(`Não foi possível localizar nem criar o fornecedor "${nome}" no Omie (${acc.name}).`);
}

// =====================================================================
// LISTAGENS PARA OS DROPDOWNS (categorias de despesa, contas correntes, projetos)
// =====================================================================

export interface CategoriaOmie { codigo: string; descricao: string }
export interface ContaCorrenteOmie { id: number; descricao: string; tipo?: string }
export interface DepartamentoOmie { codigo: string; descricao: string }
// ProjetoOmie é re-exportado mais abaixo de src/lib/omie/matching.ts (mesmo shape).

const cacheCategorias = new Map<string, CategoriaOmie[]>();
const cacheContas = new Map<string, ContaCorrenteOmie[]>();
const cacheProjetos = new Map<string, { codigo: number; nome: string }[]>();
const cacheDepartamentos = new Map<string, DepartamentoOmie[]>();

export async function listarCategoriasDespesa(acc: OmieAccount): Promise<CategoriaOmie[]> {
  if (cacheCategorias.has(acc.name)) return cacheCategorias.get(acc.name)!;
  const out: CategoriaOmie[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  while (pagina <= totalPaginas) {
    const r = await omieCall<{
      categoria_cadastro?: Array<{ codigo: string; descricao: string; conta_despesa?: string; nao_exibir?: string; totalizadora?: string }>;
      total_de_paginas?: number;
    }>("/geral/categorias/", "ListarCategorias", { pagina, registros_por_pagina: 500 }, acc);
    if (pagina === 1) totalPaginas = r?.total_de_paginas || 1;
    for (const c of r?.categoria_cadastro || []) {
      if (c.conta_despesa === "S" && c.totalizadora !== "S" && c.nao_exibir !== "S") {
        out.push({ codigo: c.codigo, descricao: c.descricao });
      }
    }
    pagina++;
    if (pagina <= totalPaginas) await new Promise((r) => setTimeout(r, 300));
  }
  out.sort((a, b) => a.codigo.localeCompare(b.codigo));
  cacheCategorias.set(acc.name, out);
  return out;
}

export async function listarContasCorrentes(acc: OmieAccount): Promise<ContaCorrenteOmie[]> {
  if (cacheContas.has(acc.name)) return cacheContas.get(acc.name)!;
  const out: ContaCorrenteOmie[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  while (pagina <= totalPaginas) {
    const r = await omieCall<{
      ListarContasCorrentes?: Array<{ nCodCC: number; descricao: string; tipo_conta_corrente?: string; inativo?: string }>;
      total_de_paginas?: number;
    }>("/geral/contacorrente/", "ListarContasCorrentes", { pagina, registros_por_pagina: 50, apenas_importado_api: "N" }, acc);
    if (pagina === 1) totalPaginas = r?.total_de_paginas || 1;
    for (const c of r?.ListarContasCorrentes || []) {
      if (c.inativo !== "S") out.push({ id: c.nCodCC, descricao: c.descricao, tipo: c.tipo_conta_corrente });
    }
    pagina++;
    if (pagina <= totalPaginas) await new Promise((r) => setTimeout(r, 300));
  }
  cacheContas.set(acc.name, out);
  return out;
}

export async function listarProjetos(acc: OmieAccount): Promise<ProjetoOmie[]> {
  if (cacheProjetos.has(acc.name)) return cacheProjetos.get(acc.name)!;
  const out: ProjetoOmie[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  while (pagina <= totalPaginas) {
    const r = await omieCall<{
      cadastro?: Array<{ codigo: number; nome: string; inativo?: string }>;
      total_de_paginas?: number;
    }>("/geral/projetos/", "ListarProjetos", { pagina, registros_por_pagina: 100 }, acc);
    if (pagina === 1) totalPaginas = r?.total_de_paginas || 1;
    for (const p of r?.cadastro || []) {
      if (p.inativo !== "S") out.push({ codigo: p.codigo, nome: p.nome });
    }
    pagina++;
    if (pagina <= totalPaginas) await new Promise((r) => setTimeout(r, 300));
  }
  out.sort((a, b) => a.nome.localeCompare(b.nome));
  cacheProjetos.set(acc.name, out);
  return out;
}

export async function listarDepartamentos(acc: OmieAccount): Promise<DepartamentoOmie[]> {
  if (cacheDepartamentos.has(acc.name)) return cacheDepartamentos.get(acc.name)!;
  const out: DepartamentoOmie[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  while (pagina <= totalPaginas) {
    const r = await omieCall<{
      departamentos?: Array<{ codigo: string; descricao: string; inativo?: string }>;
      total_de_paginas?: number;
    }>("/geral/departamentos/", "ListarDepartamentos", { pagina, registros_por_pagina: 100 }, acc);
    if (pagina === 1) totalPaginas = r?.total_de_paginas || 1;
    for (const d of r?.departamentos || []) {
      if (d.inativo !== "S") out.push({ codigo: String(d.codigo), descricao: d.descricao });
    }
    pagina++;
    if (pagina <= totalPaginas) await new Promise((r) => setTimeout(r, 300));
  }
  out.sort((a, b) => a.descricao.localeCompare(b.descricao));
  cacheDepartamentos.set(acc.name, out);
  return out;
}

// =====================================================================
// CRIAR CONTA A PAGAR
// =====================================================================

export interface ContaPagarInput {
  codigoIntegracao: string; // estável: FP-<id> ou FP-<id>-P<n> — NUNCA mude isto entre tentativas
  codFornecedor: number;
  dataVencimento: string; // dd/mm/aaaa
  valor: number;
  codigoCategoria?: string;
  idContaCorrente?: number;
  codigoProjeto?: number;
  numeroDocumento?: string;
  observacao?: string;
  numeroParcela?: string; // ex "001/003"
  codigoVendedor?: number;          // codigo_vendedor (Fase 2.1.c)
  codigoTipoDocumento?: string;     // codigo_tipo_documento (ex "NFE", "REC")
  numeroDocumentoFiscal?: string;   // numero_documento_fiscal = número da NF (máx 20 chars)
  codigoDepartamento?: string;      // departamento → estrutura distribuicao (100%)
  chaveNFe?: string;                // chave de acesso NF-e (44 dígitos)
}

export interface ContaPagarResult { codigoLancamentoOmie: number; codigoIntegracao: string; jaExistia: boolean }

async function consultarContaPagarPorIntegracao(codigoIntegracao: string, acc: OmieAccount): Promise<number | null> {
  try {
    const r = await omieCall<{ codigo_lancamento_omie?: number }>(
      "/financas/contapagar/",
      "ConsultarContaPagar",
      { conta_pagar_cadastro_chave: { codigo_lancamento_integracao: codigoIntegracao } },
      acc,
    );
    return r?.codigo_lancamento_omie || null;
  } catch {
    return null;
  }
}

export async function criarContaPagarOmie(input: ContaPagarInput, acc: OmieAccount): Promise<ContaPagarResult> {
  const param: Record<string, unknown> = {
    codigo_lancamento_integracao: input.codigoIntegracao,
    codigo_cliente_fornecedor: input.codFornecedor,
    data_vencimento: input.dataVencimento,
    data_previsao: input.dataVencimento,
    valor_documento: Number(input.valor.toFixed(2)),
  };
  if (input.codigoCategoria) param.codigo_categoria = input.codigoCategoria;
  if (input.idContaCorrente) param.id_conta_corrente = input.idContaCorrente;
  if (input.codigoProjeto) param.codigo_projeto = input.codigoProjeto;
  if (input.numeroDocumento) param.numero_documento = String(input.numeroDocumento).slice(0, 20);
  if (input.numeroParcela) param.numero_parcela = input.numeroParcela.slice(0, 7);
  if (input.observacao) param.observacao = String(input.observacao).slice(0, 999);
  if (input.codigoVendedor) param.codigo_vendedor = input.codigoVendedor;
  if (input.codigoTipoDocumento) param.codigo_tipo_documento = String(input.codigoTipoDocumento).slice(0, 8);
  if (input.numeroDocumentoFiscal) param.numero_documento_fiscal = String(input.numeroDocumentoFiscal).slice(0, 20);
  // Departamento → estrutura de distribuição (100% para um único departamento).
  if (input.codigoDepartamento) {
    param.distribuicao = [{ cCodDep: String(input.codigoDepartamento), nPerDep: 100 }];
  }
  // Chave de acesso da NF-e (44 dígitos). Só envia se tiver exatamente 44.
  if (input.chaveNFe) {
    const ch = String(input.chaveNFe).replace(/\D/g, "");
    if (ch.length === 44) param.chave_nfe = ch;
  }

  try {
    const r = await omieCall<{ codigo_lancamento_omie?: number }>("/financas/contapagar/", "IncluirContaPagar", param, acc);
    if (!r?.codigo_lancamento_omie) throw new Error("Omie não retornou codigo_lancamento_omie.");
    return { codigoLancamentoOmie: r.codigo_lancamento_omie, codigoIntegracao: input.codigoIntegracao, jaExistia: false };
  } catch (err) {
    if (!isJaCadastrado(err)) throw err;
    // Já existe um lançamento com este código de integração → devolve o existente (idempotência).
    const existente = await consultarContaPagarPorIntegracao(input.codigoIntegracao, acc);
    if (existente) return { codigoLancamentoOmie: existente, codigoIntegracao: input.codigoIntegracao, jaExistia: true };
    throw err;
  }
}

// =====================================================================
// ANEXOS — sobe um arquivo para um lançamento de conta a pagar.
// Endpoint geral/anexo/ · método IncluirAnexo. cTabela = "conta-pagar".
// A API exige: cArquivo = arquivo compactado (ZIP) e convertido em base64,
// e cMd5 = hash MD5 do ZIP. Idempotente via cCodIntAnexo.
// =====================================================================

// CRC-32 (necessário no cabeçalho ZIP).
const CRC32_TABELA: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABELA[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Monta um ZIP (método "stored", sem compressão) com um único arquivo dentro. */
function criarZipArquivoUnico(nomeInterno: string, conteudo: Buffer): Buffer {
  const nome = Buffer.from(nomeInterno, "utf8");
  const crc = crc32(conteudo);
  const tam = conteudo.length;

  const lfh = Buffer.alloc(30); // local file header
  lfh.writeUInt32LE(0x04034b50, 0);
  lfh.writeUInt16LE(20, 4);
  lfh.writeUInt32LE(crc, 14);
  lfh.writeUInt32LE(tam, 18);
  lfh.writeUInt32LE(tam, 22);
  lfh.writeUInt16LE(nome.length, 26);

  const cdh = Buffer.alloc(46); // central directory header
  cdh.writeUInt32LE(0x02014b50, 0);
  cdh.writeUInt16LE(20, 4);
  cdh.writeUInt16LE(20, 6);
  cdh.writeUInt32LE(crc, 16);
  cdh.writeUInt32LE(tam, 20);
  cdh.writeUInt32LE(tam, 24);
  cdh.writeUInt16LE(nome.length, 28);

  const eocd = Buffer.alloc(22); // end of central directory
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdh.length + nome.length, 12);
  eocd.writeUInt32LE(lfh.length + nome.length + tam, 16);

  return Buffer.concat([lfh, nome, conteudo, cdh, nome, eocd]);
}

export async function anexarArquivoContaPagarOmie(
  codigoLancamento: number,
  codigoIntegracao: string,
  nomeArquivo: string,
  tipoArquivo: string,
  conteudo: Buffer,
  acc: OmieAccount,
): Promise<{ anexado: boolean; jaExistia: boolean }> {
  const zip = criarZipArquivoUnico(nomeArquivo, conteudo);
  const cArquivo = zip.toString("base64");
  // O Omie valida o MD5 do conteúdo literal da tag cArquivo (a string base64).
  const cMd5 = createHash("md5").update(cArquivo).digest("hex");
  try {
    await omieCall<{ nIdAnexo?: number }>(
      "/geral/anexo/",
      "IncluirAnexo",
      {
        cCodIntAnexo: codigoIntegracao,
        cTabela: "conta-pagar",
        nId: codigoLancamento,
        cNomeArquivo: nomeArquivo,
        cTipoArquivo: tipoArquivo,
        cArquivo,
        cMd5,
      },
      acc,
    );
    return { anexado: true, jaExistia: false };
  } catch (err) {
    if (isJaCadastrado(err)) return { anexado: true, jaExistia: true };
    throw err;
  }
}

const MAX_ANEXO_BYTES = 8 * 1024 * 1024; // 8 MB por arquivo

/**
 * Baixa NF, boletos, requisições e XML do storage e sobe cada um como anexo
 * do lançamento Omie. Best-effort: cada arquivo num try/catch isolado.
 */
export async function anexarDocumentosContaPagarOmie(
  row: Record<string, unknown>,
  codigoLancamento: number,
  acc: OmieAccount,
): Promise<{ ok: number; falhas: string[] }> {
  const id = row.id;
  const alvos: { url: string; codInt: string; rotulo: string }[] = [];
  if (row.anexo_nf) alvos.push({ url: String(row.anexo_nf), codInt: `FP-${id}-NF`, rotulo: "Nota fiscal" });
  String(row.anexo_boleto || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((u, i) => alvos.push({ url: u, codInt: `FP-${id}-BOL${i + 1}`, rotulo: `Boleto ${i + 1}` }));
  String(row.anexo_requisicao || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((u, i) => alvos.push({ url: u, codInt: `FP-${id}-REQ${i + 1}`, rotulo: `Requisição ${i + 1}` }));
  if (row.nfe_xml_url) alvos.push({ url: String(row.nfe_xml_url), codInt: `FP-${id}-XML`, rotulo: "XML NF-e" });

  let ok = 0;
  const falhas: string[] = [];
  for (const alvo of alvos) {
    try {
      const resp = await fetch(alvo.url);
      if (!resp.ok) throw new Error(`download HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > MAX_ANEXO_BYTES) {
        falhas.push(`${alvo.rotulo}: arquivo acima de 8 MB`);
        continue;
      }
      const nome = decodeURIComponent(alvo.url.split("?")[0].split("/").pop() || `${alvo.rotulo}.pdf`);
      const ext = (nome.split(".").pop() || "pdf").toLowerCase().slice(0, 10);
      await anexarArquivoContaPagarOmie(codigoLancamento, alvo.codInt, nome, ext, buf, acc);
      ok++;
    } catch (e) {
      falhas.push(`${alvo.rotulo}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok, falhas };
}

// =====================================================================
// ORQUESTRAÇÃO: a partir de um registro finan_pagar, monta e cria o(s) lançamento(s)
// =====================================================================

export interface FinanPagarRow {
  id: number | string;
  fornecedor?: string | null;
  valor?: string | number | null;
  data_vencimento?: string | null;
  motivo?: string | null;
  numero_NF?: string | null;
  metodo?: string | null;
  qtd_parcelas?: number | null;
  parcelas_vencimentos?: string | null; // "2026-01-01|123.45, 2026-02-01|123.45"
  criado_por?: string | null;           // quem registrou a conta no portal
  autonomo_sem_nota?: boolean | null;   // prestador autônomo: sem NF nem boleto
}

export interface EnviarContaPagarOpts {
  codFornecedor: number;
  codigoCategoria?: string;
  idContaCorrente?: number;
  codigoProjeto?: number;
  codigoVendedor?: number;
  codigoTipoDocumento?: string;
  numeroDocumentoFiscal?: string; // número da NF (máx 20 chars)
  codigoDepartamento?: string;
  chaveNFe?: string;              // chave de acesso NF-e (44 dígitos)
  enviadoPor?: string;           // quem clicou "enviar ao Omie" no portal
}

// Monta a observação do lançamento: motivo + nota de autônomo (se for o caso) + autoria.
// Ex: "Pagamento mangueira\nSem NF e boleto — fornecedor considerado autônomo por
//      Fulano.\nCriado por Fulano · Enviado por Beltrano"
// Se faltar alguma parte, ela é omitida. Truncado depois em 999.
function montarObservacao(row: FinanPagarRow, enviadoPor?: string | null): string {
  const motivo = (row.motivo || "").trim();
  const criadoPor = (row.criado_por || "").trim();
  const enviado = (enviadoPor || "").trim();

  const autoria: string[] = [];
  if (criadoPor) autoria.push(`Criado por ${criadoPor}`);
  if (enviado) autoria.push(`Enviado por ${enviado}`);
  const linhaAutoria = autoria.join(" · ");

  const linhas: string[] = [];
  if (motivo) linhas.push(motivo);
  if (row.autonomo_sem_nota) {
    linhas.push(
      criadoPor
        ? `Sem NF e boleto — fornecedor considerado autônomo por ${criadoPor}.`
        : "Sem NF e boleto — fornecedor considerado autônomo.",
    );
  }
  if (linhaAutoria) linhas.push(linhaAutoria);
  return linhas.join("\n");
}

function parseParcelas(row: FinanPagarRow): Array<{ vencimento: string; valor: number }> {
  if (!row.parcelas_vencimentos) return [];
  return row.parcelas_vencimentos
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => {
      const [venc, val] = e.split("|").map((x) => x.trim());
      return { vencimento: dataParaOmie(venc), valor: parseValor(val) };
    })
    .filter((p) => p.vencimento);
}

/**
 * Cria no Omie o(s) lançamento(s) de contas a pagar correspondente(s) ao registro finan_pagar.
 * Retorna a lista de códigos criados (1, ou N se parcelado).
 */
export async function enviarFinanPagarParaOmie(
  row: FinanPagarRow,
  opts: EnviarContaPagarOpts,
  acc: OmieAccount,
): Promise<{ codigos: number[]; jaExistia: boolean }> {
  // Observação = motivo do registro + linha de autoria (criado por / enviado por).
  const observacao = montarObservacao(row, opts.enviadoPor);
  const numeroDocumento = (row.numero_NF || "").trim();
  const parcelas = row.metodo === "Boleto Parcelado" ? parseParcelas(row) : [];

  const baseInput = {
    codFornecedor: opts.codFornecedor,
    codigoCategoria: opts.codigoCategoria,
    idContaCorrente: opts.idContaCorrente,
    codigoProjeto: opts.codigoProjeto,
    codigoVendedor: opts.codigoVendedor,
    codigoTipoDocumento: opts.codigoTipoDocumento,
    numeroDocumentoFiscal: opts.numeroDocumentoFiscal,
    codigoDepartamento: opts.codigoDepartamento,
    chaveNFe: opts.chaveNFe,
    numeroDocumento,
    observacao,
  };

  if (parcelas.length > 1) {
    const total = parcelas.length;
    const codigos: number[] = [];
    let algumJaExistia = false;
    for (let i = 0; i < total; i++) {
      const n = i + 1;
      const res = await criarContaPagarOmie(
        {
          ...baseInput,
          codigoIntegracao: `FP-${row.id}-P${n}`,
          dataVencimento: parcelas[i].vencimento,
          valor: parcelas[i].valor,
          numeroParcela: `${String(n).padStart(3, "0")}/${String(total).padStart(3, "0")}`,
        },
        acc,
      );
      codigos.push(res.codigoLancamentoOmie);
      if (res.jaExistia) algumJaExistia = true;
    }
    return { codigos, jaExistia: algumJaExistia };
  }

  // lançamento único
  const dataVencimento = dataParaOmie(row.data_vencimento);
  if (!dataVencimento) throw new Error("Registro sem data de vencimento.");
  const valor = parseValor(row.valor);
  if (!(valor > 0)) throw new Error("Registro com valor inválido (precisa ser maior que zero).");

  const res = await criarContaPagarOmie(
    { ...baseInput, codigoIntegracao: `FP-${row.id}`, dataVencimento, valor },
    acc,
  );
  return { codigos: [res.codigoLancamentoOmie], jaExistia: res.jaExistia };
}

// =====================================================================
// VENDEDORES E TIPOS DE DOCUMENTO (Fase 2.1.a e 2.1.b)
// =====================================================================
// Vendedores e projetos reaproveitam src/lib/omie/matching.ts (lógica de
// matching fuzzy NFD+lowercase+includes com fallback Dice).

import {
  buscarVendedorPorNome,
  buscarProjetoPorNome,
  carregarVendedoresOmie,
  invalidarCacheMatching,
} from "@/lib/omie/matching";
import type { VendedorOmie, ProjetoOmie, MatchResult } from "@/lib/omie/matching";

export { buscarVendedorPorNome, buscarProjetoPorNome, carregarVendedoresOmie, invalidarCacheMatching };
export type { VendedorOmie, ProjetoOmie, MatchResult };

export interface TipoDocumentoOmie { codigo: string; descricao: string }
const cacheTiposDoc = new Map<string, TipoDocumentoOmie[]>();

// Fallback hardcoded (planos básicos do Omie não suportam PesquisarTipoDocumento)
const TIPOS_DOC_FALLBACK: TipoDocumentoOmie[] = [
  { codigo: "NFE", descricao: "Nota Fiscal Eletrônica" },
  { codigo: "NFSE", descricao: "Nota Fiscal de Serviço Eletrônica" },
  { codigo: "REC", descricao: "Recibo" },
  { codigo: "BOL", descricao: "Boleto" },
  { codigo: "RPS", descricao: "RPS" },
  { codigo: "OUT", descricao: "Outros" },
];

export async function listarTiposDocumento(acc: OmieAccount): Promise<TipoDocumentoOmie[]> {
  if (cacheTiposDoc.has(acc.name)) return cacheTiposDoc.get(acc.name)!;
  try {
    const r = await omieCall<{
      tipo_documento_cadastro?: Array<{ codigo: string; descricao: string }>;
    }>("/geral/tiposdoc/", "PesquisarTipoDocumento", { codigo: "" }, acc);
    const lista = (r?.tipo_documento_cadastro || []).map((t) => ({ codigo: t.codigo, descricao: t.descricao }));
    const out = lista.length > 0 ? lista : TIPOS_DOC_FALLBACK;
    cacheTiposDoc.set(acc.name, out);
    return out;
  } catch (e) {
    console.warn(`[Omie ${acc.name}] PesquisarTipoDocumento falhou — usando fallback hardcoded.`, e instanceof Error ? e.message : e);
    cacheTiposDoc.set(acc.name, TIPOS_DOC_FALLBACK);
    return TIPOS_DOC_FALLBACK;
  }
}

// =====================================================================
// RESOLVER DE REQUISIÇÃO → VENDEDOR/PROJETO (Fase 2.1.d)
// =====================================================================

export interface ContextoRequisicao {
  solicitante?: string | null;       // Requisicao.solicitante (texto, do req_usuarios.nome ou email)
  ordemServicoId?: string | null;    // Requisicao.ordem_servico → Ordem_Servico.Id_Ordem
  veiculoId?: number | null;         // Requisicao.veiculo → SupaPlacas.IdPlaca
  chassisModelo?: string | null;     // Requisicao.Chassis_Modelo (texto livre)
}

export interface ResolucaoReq {
  codigoVendedor?: number;
  vendedorAproximado?: boolean;
  codigoProjeto?: number;
  projetoAproximado?: boolean;
  fonteProjeto?: "os" | "placa" | "chassi";
  debug?: { vendedorViaCache?: boolean; projetoViaCache?: boolean };
}

// Interface mínima do supabase client — não importamos o tipo direto pra não acoplar.
interface SupabaseLike {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, value: unknown): { single(): Promise<{ data: Record<string, unknown> | null }>; maybeSingle(): Promise<{ data: Record<string, unknown> | null }>; limit(n: number): Promise<{ data: Array<Record<string, unknown>> | null }> };
      ilike(col: string, pattern: string): { limit(n: number): Promise<{ data: Array<Record<string, unknown>> | null }> };
    };
    update(values: Record<string, unknown>): { eq(col: string, value: unknown): Promise<unknown> };
  };
}

/** Resolve a fonte do solicitante: pode ser nome ou email; retorna { nome, registroId } do req_usuarios. */
async function resolverSolicitante(solicitante: string, supabase: SupabaseLike): Promise<{ nome: string; registro?: { id?: unknown; id_vendedor_omie?: number | null; id_vendedor_omie_castro?: number | null } | null }> {
  const s = solicitante.trim();
  if (!s) return { nome: "" };

  if (s.includes("@")) {
    // formato legado (email) — resolver para nome via req_usuarios
    const { data } = await supabase
      .from("req_usuarios")
      .select("id, nome, id_vendedor_omie, id_vendedor_omie_castro")
      .eq("email", s)
      .maybeSingle();
    if (data?.nome) {
      return { nome: String(data.nome), registro: data as { id?: unknown; id_vendedor_omie?: number | null; id_vendedor_omie_castro?: number | null } };
    }
    return { nome: s };
  }

  // busca por nome
  const { data } = await supabase
    .from("req_usuarios")
    .select("id, nome, id_vendedor_omie, id_vendedor_omie_castro")
    .ilike("nome", s)
    .limit(1);
  if (data && data[0]) {
    return { nome: String(data[0].nome || s), registro: data[0] as { id?: unknown; id_vendedor_omie?: number | null; id_vendedor_omie_castro?: number | null } };
  }
  return { nome: s };
}

export async function resolverVendedorProjetoDeReq(
  ctx: ContextoRequisicao,
  acc: OmieAccount,
  supabase: SupabaseLike,
): Promise<ResolucaoReq> {
  const out: ResolucaoReq = { debug: {} };
  const colVend = acc.name.toLowerCase().includes("castro") ? "id_vendedor_omie_castro" : "id_vendedor_omie";
  const colProj = acc.name.toLowerCase().includes("castro") ? "id_projeto_omie_castro" : "id_projeto_omie";

  // -----------------------------------------------------------------
  // 1) VENDEDOR (a partir do solicitante)
  // -----------------------------------------------------------------
  if (ctx.solicitante) {
    const { nome, registro } = await resolverSolicitante(ctx.solicitante, supabase);
    const cached = registro?.[colVend as "id_vendedor_omie" | "id_vendedor_omie_castro"];
    if (cached) {
      out.codigoVendedor = Number(cached);
      out.debug!.vendedorViaCache = true;
    } else if (nome) {
      const match = await buscarVendedorPorNome(nome, undefined, acc);
      if (match.codigo) {
        out.codigoVendedor = match.codigo;
        out.vendedorAproximado = match.aproximado;
        // grava cache se temos id do registro
        if (registro?.id != null) {
          await supabase.from("req_usuarios").update({ [colVend]: match.codigo }).eq("id", registro.id);
        }
      }
    }
  }

  // -----------------------------------------------------------------
  // 2) PROJETO — prioridade: OS > Placa > Chassi
  // -----------------------------------------------------------------
  // 2a. OS
  if (ctx.ordemServicoId) {
    const { data: os } = await supabase
      .from("Ordem_Servico")
      .select("Projeto")
      .eq("Id_Ordem", ctx.ordemServicoId)
      .maybeSingle();
    const projetoNome = os?.Projeto ? String(os.Projeto) : "";
    if (projetoNome) {
      const match = await buscarProjetoPorNome(projetoNome, acc);
      if (match.codigo) {
        out.codigoProjeto = match.codigo;
        out.projetoAproximado = match.aproximado;
        out.fonteProjeto = "os";
      }
    }
  }

  // 2b. Placa (SupaPlacas, com cache)
  if (!out.codigoProjeto && ctx.veiculoId) {
    const { data: placa } = await supabase
      .from("SupaPlacas")
      .select(`IdPlaca, NumPlaca, ${colProj}`)
      .eq("IdPlaca", ctx.veiculoId)
      .maybeSingle();
    if (placa) {
      const cached = placa[colProj as "id_projeto_omie" | "id_projeto_omie_castro"];
      if (cached) {
        out.codigoProjeto = Number(cached);
        out.fonteProjeto = "placa";
        out.debug!.projetoViaCache = true;
      } else if (placa.NumPlaca) {
        const match = await buscarProjetoPorNome(String(placa.NumPlaca), acc);
        if (match.codigo) {
          out.codigoProjeto = match.codigo;
          out.projetoAproximado = match.aproximado;
          out.fonteProjeto = "placa";
          await supabase.from("SupaPlacas").update({ [colProj]: match.codigo }).eq("IdPlaca", ctx.veiculoId);
        }
      }
    }
  }

  // 2c. Chassi/Modelo (texto livre, sem cache local)
  if (!out.codigoProjeto && ctx.chassisModelo) {
    const match = await buscarProjetoPorNome(ctx.chassisModelo, acc);
    if (match.codigo) {
      out.codigoProjeto = match.codigo;
      out.projetoAproximado = match.aproximado;
      out.fonteProjeto = "chassi";
    }
  }

  return out;
}

// =====================================================================
// VALIDADOR PURO — checklist do que falta para enviar ao Omie (Fase 2.1.e)
// =====================================================================

export interface ValidacaoIssue {
  campo: string;
  mensagem: string;
  severidade: "erro" | "aviso";
}

export interface ValidacaoInput {
  row: FinanPagarRow & {
    anexo_nf?: string | null;
    anexo_boleto?: string | null;
    nfe_chave?: string | null;
    autonomo_sem_nota?: boolean | null;
    omie_vendedor?: number | null;
    omie_tipo_documento?: string | null;
    omie_cod_lancamento?: string | null;
  };
  opts: Partial<EnviarContaPagarOpts> & { empresa?: string };
  fornecedorCadastro?: { documento?: string | null } | null;
}

/** Valida um registro finan_pagar contra os requisitos de envio Omie. Retorna [] se OK. */
export function validarContaPagarParaOmie(input: ValidacaoInput): ValidacaoIssue[] {
  const { row, opts, fornecedorCadastro } = input;
  const issues: ValidacaoIssue[] = [];

  const isCarne = (row.metodo || "").toLowerCase().includes("carnê iss") || (row.metodo || "").toLowerCase().includes("carne iss");
  const isBoleto = (row.metodo || "").toLowerCase().startsWith("boleto");
  // Prestador autônomo (RPA): não emite nota fiscal nem boleto — dispensa ambos.
  const semNota = !!row.autonomo_sem_nota;

  // NF — dispensada para Carnê ISS e para prestador autônomo
  if (!isCarne && !semNota) {
    if (!String(row.numero_NF || "").trim()) {
      issues.push({ campo: "numero_NF", mensagem: "Informe o número da NF (ou marque como Carnê ISS).", severidade: "erro" });
    }
    if (!String(row.anexo_nf || "").trim()) {
      issues.push({ campo: "anexo_nf", mensagem: "Anexe a NF (PDF ou XML).", severidade: "erro" });
    }
  }

  // Boleto — dispensado para prestador autônomo
  if (isBoleto && !semNota && !String(row.anexo_boleto || "").trim()) {
    issues.push({ campo: "anexo_boleto", mensagem: "Anexe o boleto.", severidade: "erro" });
  }

  // Empresa + categoria + conta corrente
  if (!opts.empresa) {
    issues.push({ campo: "empresa", mensagem: "Selecione a empresa Omie.", severidade: "erro" });
  }
  if (!opts.codigoCategoria) {
    issues.push({ campo: "codigoCategoria", mensagem: "Selecione a categoria de despesa.", severidade: "erro" });
  }
  if (!opts.idContaCorrente) {
    issues.push({ campo: "idContaCorrente", mensagem: "Selecione a conta corrente.", severidade: "erro" });
  }

  // Vencimento + valor
  const parcelas = (row.metodo === "Boleto Parcelado") ? parseParcelas(row) : [];
  if (parcelas.length > 1) {
    const somaParc = parcelas.reduce((a, p) => a + p.valor, 0);
    const total = parseValor(row.valor);
    if (Math.abs(somaParc - total) > 0.01) {
      issues.push({ campo: "parcelas", mensagem: `A soma das parcelas (R$ ${somaParc.toFixed(2)}) não bate com o valor total (R$ ${total.toFixed(2)}).`, severidade: "erro" });
    }
    if (parcelas.some((p) => !p.vencimento)) {
      issues.push({ campo: "parcelas", mensagem: "Há parcelas sem data de vencimento.", severidade: "erro" });
    }
  } else {
    if (!dataParaOmie(row.data_vencimento)) {
      issues.push({ campo: "data_vencimento", mensagem: "Informe a data de vencimento.", severidade: "erro" });
    }
    if (!(parseValor(row.valor) > 0)) {
      issues.push({ campo: "valor", mensagem: "Valor deve ser maior que zero.", severidade: "erro" });
    }
  }

  // Fornecedor com documento
  if (!fornecedorCadastro) {
    issues.push({ campo: "fornecedor", mensagem: "Fornecedor não está no cadastro — cadastre-o (com CNPJ/CPF) antes de enviar.", severidade: "erro" });
  } else if (!soDigitos(fornecedorCadastro.documento || "")) {
    issues.push({ campo: "fornecedor.documento", mensagem: "Fornecedor está sem CNPJ/CPF.", severidade: "erro" });
  }

  // Avisos (não bloqueiam)
  if (!opts.codigoVendedor && !row.omie_vendedor) {
    issues.push({ campo: "codigoVendedor", mensagem: "Vendedor não informado (recomendado para rastreio).", severidade: "aviso" });
  }
  if (!opts.codigoTipoDocumento && !row.omie_tipo_documento) {
    issues.push({ campo: "codigoTipoDocumento", mensagem: "Tipo de documento não informado.", severidade: "aviso" });
  }
  if (!row.nfe_chave && !isCarne && !semNota) {
    issues.push({ campo: "nfe_chave", mensagem: "Sem chave NF-e — recomendamos importar o XML para rastreabilidade.", severidade: "aviso" });
  }

  return issues;
}
