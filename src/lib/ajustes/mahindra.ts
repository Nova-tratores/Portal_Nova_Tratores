/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Geracao do "Arquivo Padrao - Estoque e Venda de Pecas" da Mahindra.
// Portado de src/mahindra.js (CommonJS) do app "Omie CMC Garantia".
//
// Fluxo (semi-automatico):
//  1. O operador sobe o template oficial (xlsx com a lista FIXA de pecas).
//  2. Lemos os codigos da peca da tabela do template.
//  3. Buscamos no Omie:
//       - posicao de estoque no FIM do mes de referencia (ListarPosEstoque);
//       - quantidade vendida no mes (PEDIDOS de venda / ListarPedidos, somente
//         etapa 60/70 e nao cancelados), somada por peca.
//  4. Preenchemos as colunas QUANTIDADE DO ESTOQUE e QUANTIDADE VENDIDA no
//     proprio template e devolvemos o xlsx + um resumo de conferencia.
//
// O casamento e' feito por CODIGO DA PECA == SKU do produto no Omie. Normalizamos
// (trim/upper/sem espacos).
//
// OBS sobre estilos: o SheetJS community nao reescreve estilos/imagens ao salvar.
// Valores, linhas/colunas e celulas mescladas sao preservados; logo/cores podem
// se perder. Tradeoff aceito (preencher o template em vez de gerar do zero).
//
// WORKER-READY: a geracao e' PESADA (consulta Omie), entao roda em background.
// O estado vive na tabela ajustes_jobs (job 'mahindra-gerar') e o xlsx gerado e'
// gravado em mahindra_arquivos (conteudo_base64). O download le sempre do banco.
// ============================================================================

import * as XLSX from 'xlsx';
import path from 'path';
import { promises as fs } from 'fs';
import type { Conta } from './conta';
import { labelConta } from './conta';
import { inicioMes, fimMes, fmtBR } from './dates';
import { supabase } from './supabase';
import { obterPosicaoEstoqueBulk, listarPedidos, normalizarPedido } from './omie';
import { criarJob, atualizarJob, concluirJob, falharJob, lerJobAtivo, jobRodando, jobEstaVivo } from './jobs';

// referencia A1 de uma celula (coluna c, linha r) - ambos base 0
const ref = (c: number, r: number) => XLSX.utils.encode_cell({ c, r });

// normaliza um codigo de peca para comparacao
function normCod(s: any): string {
  return String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, '');
}

interface TabelaInfo {
  headerRow: number;
  codCol: number;
  descCol: number;
  estCol: number;
  vendCol: number;
  range: XLSX.Range;
}

// Localiza a linha de cabecalho da tabela de pecas e as colunas relevantes.
// Procura uma linha que tenha, ao mesmo tempo, uma coluna de CODIGO, uma de
// ESTOQUE (quantidade) e uma de VENDIDA. Retorna indices base 0 ou null.
export function localizarTabela(sheet: XLSX.WorkSheet): TabelaInfo | null {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  for (let r = range.s.r; r <= range.e.r; r++) {
    let codCol = -1, descCol = -1, estCol = -1, vendCol = -1;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[ref(c, r)];
      if (!cell || cell.v == null) continue;
      const t = String(cell.v).toUpperCase();
      if (codCol < 0 && /C[ÓO]DIGO/.test(t)) codCol = c;
      if (descCol < 0 && /DESCRI/.test(t)) descCol = c;
      if (estCol < 0 && /ESTOQUE/.test(t)) estCol = c;
      if (vendCol < 0 && /VENDID/.test(t)) vendCol = c;
    }
    if (codCol >= 0 && estCol >= 0 && vendCol >= 0) {
      return { headerRow: r, codCol, descCol, estCol, vendCol, range };
    }
  }
  return null;
}

// escreve `value` na celula so se ela estiver vazia (nao sobrescreve dado do template)
function setIfEmpty(sheet: XLSX.WorkSheet, c: number, r: number, value: any): void {
  const cur = sheet[ref(c, r)];
  if (cur && cur.v != null && String(cur.v).trim() !== '') return;
  sheet[ref(c, r)] = (typeof value === 'number') ? { t: 'n', v: value } : { t: 's', v: String(value) };
}

// Preenche o cabecalho do template (Concessionaria, Mes/Ano) de forma best-effort:
// acha a celula do rotulo e escreve na celula a' direita (se vazia).
function preencherCabecalho(sheet: XLSX.WorkSheet, { concessionaria, mesAno }: { concessionaria?: string; mesAno?: string }): void {
  try {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[ref(c, r)];
        if (!cell || cell.v == null) continue;
        const t = String(cell.v).toUpperCase();
        if (/CONCESSION/.test(t) && concessionaria) setIfEmpty(sheet, c + 1, r, concessionaria);
        else if (/M[ÊE]S\s*\/?\s*ANO/.test(t) && mesAno) setIfEmpty(sheet, c + 1, r, mesAno);
      }
    }
  } catch { /* best-effort - nao quebra a geracao */ }
}

export interface ResumoMahindra {
  mes: string;
  dataInicioBR: string;
  dataFimBR: string;
  sheetName: string;
  contaLabel: string;
  totalPecas: number;
  encontradas: number;
  naoEncontrados: string[];
  somaEstoque: number;
  somaVendida: number;
  etapasVenda: string[];
  pedidosConsiderados: number;
  pedidosCancelados: number;
  pedidosForaEtapa: number;
  negativos: Array<{ codigo: string; saldo: number }>;
  vendaSemEstoque: Array<{ codigo: string; vendida: number }>;
}

export interface GerarMahindraResult {
  buffer: Buffer;
  resumo: ResumoMahindra;
  filename: string;
}

// CFOPs/etapas de venda: identico ao app original (ETAPAS_VENDA = 60,70).
function etapasVendaSet(): Set<string> {
  return new Set(
    String(process.env.MAHINDRA_ETAPAS_VENDA || '60,70').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
  );
}

// Funcao principal. Recebe o template como Buffer. Retorna { buffer, resumo, filename }.
export async function gerarArquivoMahindra(
  conta: Conta,
  opts: { templateBuffer: Buffer; mes: string; onProgress?: (m: string) => void },
): Promise<GerarMahindraResult> {
  const { templateBuffer, mes } = opts;
  const prog = (m: string) => { if (opts.onProgress) opts.onProgress(m); };
  const contaLabel = labelConta(conta);

  const mm = String(mes || '').match(/^(\d{4})-(\d{2})$/);
  if (!mm) throw new Error('mes de referencia invalido (use AAAA-MM)');
  const ano = Number(mm[1]), mesN = Number(mm[2]);
  const dataInicioBR = fmtBR(inicioMes(ano, mesN));
  const dataFimBR = fmtBR(fimMes(ano, mesN));

  // --- le o template ---
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(templateBuffer, { type: 'buffer', cellStyles: true, cellDates: true }); }
  catch (e) { throw new Error('falha ao ler o template xlsx: ' + (e as Error).message); }
  const sheetName = (workbook.SheetNames || [])[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error('o template nao tem nenhuma planilha');

  const tab = localizarTabela(sheet);
  if (!tab) throw new Error('nao encontrei a tabela de pecas no template (preciso de um cabecalho com CODIGO, ESTOQUE e VENDIDA)');

  // --- extrai os codigos da peca + a linha de cada um ---
  const linhas: Array<{ row: number; codigo: string; codigoNorm: string; descricao: string }> = [];
  for (let r = tab.headerRow + 1; r <= tab.range.e.r; r++) {
    const cell = sheet[ref(tab.codCol, r)];
    const cod = cell && cell.v != null ? String(cell.v).trim() : '';
    if (!cod) continue;
    if (!/[A-Za-z0-9]/.test(cod)) continue; // ignora celulas-lixo (ex.: "." solto no fim da planilha)
    const descCell = tab.descCol >= 0 ? sheet[ref(tab.descCol, r)] : null;
    linhas.push({ row: r, codigo: cod, codigoNorm: normCod(cod), descricao: descCell && descCell.v != null ? String(descCell.v) : '' });
  }
  if (linhas.length === 0) throw new Error('nenhum codigo de peca encontrado abaixo do cabecalho da tabela');
  prog(`${linhas.length} pecas no template`);

  // --- 1) posicao de estoque no fim do mes ---
  prog(`consultando posicao de estoque (${dataFimBR})...`);
  const posMap = await obterPosicaoEstoqueBulk(conta, { dataPosicaoBR: dataFimBR, onProgress: prog });
  const estoquePorCod = new Map<string, { saldo: number; descricao: string | null }>();
  for (const [, entry] of posMap) {
    const sku = entry.codigo != null ? normCod(entry.codigo) : null;
    if (!sku) continue;
    const cur = estoquePorCod.get(sku) || { saldo: 0, descricao: entry.descricao || null };
    cur.saldo += Number(entry.saldoTotal || 0);
    if (!cur.descricao && entry.descricao) cur.descricao = entry.descricao;
    estoquePorCod.set(sku, cur);
  }

  // --- 2) vendas no mes (PEDIDOS DE VENDA, etapa 60/70) ---
  const ETAPAS_VENDA = etapasVendaSet();
  prog(`consultando pedidos de venda (${dataInicioBR} a ${dataFimBR})...`);
  const pedidosBrutos = await listarPedidos(conta, dataInicioBR, dataFimBR, {});
  const vendaPorCod = new Map<string, number>();
  let pedidosConsiderados = 0, pedidosCancelados = 0, pedidosForaEtapa = 0;
  for (const bruto of pedidosBrutos) {
    const ped = normalizarPedido(bruto);
    if (!ped) continue;
    if (ped.cancelada) { pedidosCancelados++; continue; }
    if (!ETAPAS_VENDA.has(String(ped.etapa))) { pedidosForaEtapa++; continue; }
    pedidosConsiderados++;
    for (const it of (ped.itens || [])) {
      const sku = it.codigo != null ? normCod(it.codigo) : null;
      if (!sku) continue;
      vendaPorCod.set(sku, (vendaPorCod.get(sku) || 0) + Number(it.qtde || 0));
    }
  }
  prog(`${pedidosConsiderados} pedidos de venda (etapa ${[...ETAPAS_VENDA].join('/')}); ${pedidosCancelados} cancelados, ${pedidosForaEtapa} fora da etapa ignorados`);

  // --- 3) preenche o template + monta resumo de conferencia ---
  let somaEstoque = 0, somaVendida = 0;
  const naoEncontrados: string[] = [];
  const negativos: Array<{ codigo: string; saldo: number }> = [];
  const vendaSemEstoque: Array<{ codigo: string; vendida: number }> = [];
  for (const ln of linhas) {
    const est = estoquePorCod.get(ln.codigoNorm);
    const vend = vendaPorCod.get(ln.codigoNorm);
    const existeNoOmie = !!est;  // bulk usa cExibeTodos='S' => traz produto mesmo com saldo 0
    if (!existeNoOmie && vend == null) {
      naoEncontrados.push(ln.codigo);
      continue; // deixa as celulas em branco pro operador notar
    }
    const saldoReal = est ? Number(est.saldo || 0) : 0;
    // saldo negativo vira 0 no arquivo (exigencia: Mahindra nao aceita negativo),
    // mas continua listado em `negativos` pro operador conferir.
    const saldoArquivo = saldoReal < 0 ? 0 : saldoReal;
    const vendida = vend != null ? Number(vend) : 0;
    sheet[ref(tab.estCol, ln.row)] = { t: 'n', v: saldoArquivo };
    sheet[ref(tab.vendCol, ln.row)] = { t: 'n', v: vendida };
    somaEstoque += saldoArquivo; somaVendida += vendida;
    if (saldoReal < 0) negativos.push({ codigo: ln.codigo, saldo: saldoReal });
    if (vendida > 0 && saldoArquivo === 0) vendaSemEstoque.push({ codigo: ln.codigo, vendida });
  }

  // cabecalho (best-effort)
  preencherCabecalho(sheet, { concessionaria: contaLabel, mesAno: `${mm[2]}/${mm[1]}` });

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true }) as Buffer;
  const resumo: ResumoMahindra = {
    mes, dataInicioBR, dataFimBR, sheetName, contaLabel,
    totalPecas: linhas.length,
    encontradas: linhas.length - naoEncontrados.length,
    naoEncontrados,
    somaEstoque, somaVendida,
    etapasVenda: [...ETAPAS_VENDA],
    pedidosConsiderados, pedidosCancelados, pedidosForaEtapa,
    negativos, vendaSemEstoque,
  };
  const filename = `Estoque_Venda_Mahindra_${contaLabel}_${mes}.xlsx`;
  return { buffer, resumo, filename };
}

// ============================================================================
// Parse do template (rota /template): headers + amostra das primeiras linhas.
// ============================================================================
export interface ParseTemplateResult {
  sheets: string[];
  sheetName: string;
  headers: string[];
  sampleRows: any[][];
}

export function parseTemplate(buffer: Buffer): ParseTemplateResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    throw new Error('Falha ao ler o arquivo Excel. Verifique se e um .xlsx valido.');
  }
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Nenhuma planilha encontrada no arquivo.');
  }
  const sheets = workbook.SheetNames;
  const sheetName = sheets[0];
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const headers: string[] = [];
  const sampleRows: any[][] = [];
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ c, r: range.s.r })];
    headers.push(cell ? String(cell.v).trim() : '');
  }
  for (let r = range.s.r + 1; r <= Math.min(range.s.r + 5, range.e.r); r += 1) {
    const row: any[] = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ c, r })];
      row.push(cell ? cell.v : '');
    }
    sampleRows.push(row);
  }
  return { sheets, sheetName, headers, sampleRows };
}

// ============================================================================
// Geracao em background (worker-ready) + status.
// ============================================================================

const TABELA_ARQ = 'mahindra_arquivos';

// Template padrao do servidor: usado quando o operador NAO envia um xlsx.
// A lista de pecas e' fixa (mesma para NOVA/CASTRO); a geracao so' preenche as
// colunas de estoque/venda. Em producao (Vercel) a pasta public/ nao vai no
// bundle serverless -> carregamos via fetch da URL publica e caimos pro fs.
const TEMPLATE_PADRAO_PUBLIC_PATH = '/templates/estoque-venda-mahindra.xlsx';

async function carregarTemplatePadrao(baseUrl?: string): Promise<Buffer> {
  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}${TEMPLATE_PADRAO_PUBLIC_PATH}`);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* fallback pro fs */
    }
  }
  const diskPath = path.join(process.cwd(), 'public', 'templates', 'estoque-venda-mahindra.xlsx');
  return fs.readFile(diskPath);
}

export interface IniciarGeracaoArgs {
  /** xlsx enviado pelo operador (base64). Se vazio, usa o template padrao do servidor. */
  templateBase64: string;
  mes: string;
  criadoPor?: string | null;
  /** origem da requisicao (ex.: https://portal...), p/ ler o template padrao via fetch em producao. */
  baseUrl?: string;
}

/**
 * Inicia a geracao do arquivo Mahindra em background (worker-ready). Se ja ha uma
 * geracao rodando para a conta, retorna {jaRodando:true}. Senao cria o job
 * 'mahindra-gerar' e dispara o trabalho async (gera o xlsx, grava em
 * mahindra_arquivos e conclui o job com {arquivoId, resumo, filename}).
 */
export async function iniciarGeracao(conta: Conta, args: IniciarGeracaoArgs): Promise<any> {
  const { templateBase64, mes, criadoPor, baseUrl } = args;
  if (!/^\d{4}-\d{2}$/.test(String(mes || ''))) {
    throw new Error('Informe o mes no formato AAAA-MM');
  }
  if (await jobRodando('mahindra-gerar', conta)) {
    const ativo = await lerJobAtivo('mahindra-gerar', conta);
    return { ok: true, rodando: true, jaRodando: true, jobId: ativo?.id, etapa: ativo?.etapa };
  }

  // Sem upload -> usa o template padrao guardado no servidor (public/templates).
  let templateBuffer: Buffer;
  if (templateBase64) {
    templateBuffer = Buffer.from(templateBase64, 'base64');
  } else {
    try {
      templateBuffer = await carregarTemplatePadrao(baseUrl);
    } catch (e: any) {
      throw new Error('Nenhum template enviado e o template padrao do servidor nao pode ser lido: ' + (e?.message || String(e)));
    }
  }
  if (!templateBuffer || templateBuffer.length === 0) {
    throw new Error('Template vazio ou invalido.');
  }

  const jobId = await criarJob('mahindra-gerar', conta, criadoPor);

  // dispara em background (Railway: processo long-lived via next start)
  (async () => {
    try {
      const { buffer, resumo, filename } = await gerarArquivoMahindra(conta, {
        templateBuffer,
        mes,
        onProgress: (m: string) => {
          atualizarJob(jobId, { etapa: m });
          console.log(`[mahindra ${conta}] ${m}`);
        },
      });

      let arquivoId: number | null = null;
      try {
        const { data, error } = await supabase.from(TABELA_ARQ).insert({
          conta_omie: labelConta(conta),
          mes,
          filename,
          tamanho_bytes: buffer.length,
          resumo,
          conteudo_base64: buffer.toString('base64'),
          criado_por: criadoPor || 'portal',
        }).select('id').single();
        if (error) console.warn(`[mahindra ${conta}] historico nao salvo:`, error.message);
        arquivoId = (data as { id: number } | null)?.id ?? null;
      } catch (e: any) {
        console.warn(`[mahindra ${conta}] historico nao salvo:`, e.message);
      }

      await concluirJob(jobId, {
        arquivoId,
        resumo: resumo as any,
        filename,
        etapaFinal: `concluido - ${resumo.encontradas}/${resumo.totalPecas} pecas preenchidas`,
      });
    } catch (e: any) {
      await falharJob(jobId, e.faultstring || e.message);
      console.error(`[mahindra ${conta}]`, e);
    }
  })();

  return { ok: true, rodando: true, jobId };
}

/**
 * Estado/resultado da geracao (le do job 'mahindra-gerar' no Supabase). Semantica
 * alinhada ao polling do front: `rodando=true` enquanto o job nao terminou.
 */
export async function lerStatusGeracao(conta: Conta): Promise<any> {
  const ativo = await lerJobAtivo('mahindra-gerar', conta);
  if (!ativo) return { rodando: false, semDados: true };
  if (ativo.status === 'rodando') {
    // job travado (processo morreu no meio): reporta como erro e libera novas tentativas
    if (!jobEstaVivo(ativo)) {
      await falharJob(ativo.id, 'Processo interrompido (o servidor reiniciou durante a geração). Tente novamente.');
      return { rodando: false, erro: 'A geração foi interrompida (o servidor reiniciou). Clique em Gerar novamente.', etapa: ativo.etapa, jobId: ativo.id };
    }
    return { rodando: true, etapa: ativo.etapa, inicio: ativo.iniciado_em, jobId: ativo.id };
  }
  if (ativo.status === 'erro') {
    return { rodando: false, erro: ativo.erro, etapa: ativo.etapa, jobId: ativo.id };
  }
  const r = (ativo.resultado || {}) as any;
  return {
    rodando: false,
    pronto: !!r.arquivoId,
    arquivoId: r.arquivoId ?? null,
    filename: r.filename ?? null,
    resumo: r.resumo ?? null,
    etapa: r.etapaFinal || ativo.etapa,
    jobId: ativo.id,
    fim: ativo.atualizado_em,
  };
}

// ============================================================================
// Historico de arquivos (mahindra_arquivos).
// ============================================================================
export interface ArquivoMeta {
  id: number;
  conta_omie: string;
  mes: string;
  filename: string;
  tamanho_bytes: number;
  resumo: ResumoMahindra | null;
  criado_em: string;
  criado_por?: string | null;
}

/** Lista os 20 arquivos mais recentes (metadados, sem o base64). Por conta. */
export async function listarArquivos(conta: Conta): Promise<ArquivoMeta[]> {
  const { data, error } = await supabase.from(TABELA_ARQ)
    .select('id, conta_omie, mes, filename, tamanho_bytes, resumo, criado_em, criado_por')
    .eq('conta_omie', labelConta(conta))
    .order('criado_em', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data as ArquivoMeta[]) || [];
}

export interface ArquivoComConteudo {
  filename: string;
  buffer: Buffer;
}

/** Le um arquivo (com o base64) para download. Retorna null se nao existir. */
export async function obterArquivo(id: number): Promise<ArquivoComConteudo | null> {
  const { data, error } = await supabase.from(TABELA_ARQ)
    .select('filename, conteudo_base64')
    .eq('id', id)
    .single();
  if (error || !data || !(data as any).conteudo_base64) return null;
  return {
    filename: (data as any).filename || 'mahindra.xlsx',
    buffer: Buffer.from((data as any).conteudo_base64, 'base64'),
  };
}
