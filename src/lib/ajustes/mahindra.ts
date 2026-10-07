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
//       - quantidade vendida no mes: PEDIDOS de venda (ListarPedidos) FATURADOS
//         NO MES (infoCadastro.dFat), etapa 60/70 e nao cancelados, por peca.
//  4. Preenchemos as colunas QUANTIDADE DO ESTOQUE e QUANTIDADE VENDIDA no
//     proprio template e devolvemos o xlsx + um resumo de conferencia.
//
// As REGRAS (o que e' venda do mes, casamento de codigo com/sem "RP-",
// cabecalho, somas) vivem na lib pura ./mahindra-preencher.ts, com testes.
// Aqui fica so' a casca: consulta a Omie, job em background e historico.
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
import { inicioMes, fimMes, fmtBR, hoje } from './dates';
import { supabase } from './supabase';
import { obterPosicaoEstoqueBulk, listarPedidos, normalizarPedido } from './omie';
import { criarJob, atualizarJob, concluirJob, falharJob, lerJobAtivo, jobRodando, jobEstaVivo } from './jobs';
import {
  normCod, contarPecasTemplate, somarVendasDoMes, preencherTemplate,
  type ResumoMahindra, type PedidoVenda,
} from './mahindra-preencher';

export { localizarTabela } from './mahindra-preencher';
export type { ResumoMahindra } from './mahindra-preencher';

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
  const fim = fimMes(ano, mesN);
  const dataFimBR = fmtBR(fim);
  const agora = hoje();

  // valida o template ANTES de gastar chamadas na Omie
  prog(`${contarPecasTemplate(templateBuffer)} pecas no template`);

  // --- 1) posicao de estoque no fim do mes ---
  prog(`consultando posicao de estoque (${dataFimBR})...`);
  const posMap = await obterPosicaoEstoqueBulk(conta, { dataPosicaoBR: dataFimBR, onProgress: prog });
  const estoquePorCod = new Map<string, { saldo: number }>();
  for (const [, entry] of posMap) {
    const sku = entry.codigo != null ? normCod(entry.codigo) : null;
    if (!sku) continue;
    const cur = estoquePorCod.get(sku) || { saldo: 0 };
    cur.saldo += Number(entry.saldoTotal || 0);
    estoquePorCod.set(sku, cur);
  }

  // --- 2) vendas no mes (PEDIDOS DE VENDA faturados no mes, etapa 60/70) ---
  // A janela do ListarPedidos pega pedido INCLUIDO ou ALTERADO no periodo. Pedido
  // faturado no mes pode ter sido alterado depois, entao a janela vai do inicio
  // do mes ATE HOJE (todo pedido faturado no mes tem alteracao >= o faturamento);
  // o corte por mes e' feito em memoria, pela data de faturamento.
  const ETAPAS_VENDA = etapasVendaSet();
  const janelaAteBR = fmtBR(agora.getTime() > fim.getTime() ? agora : fim);
  prog(`consultando pedidos de venda (${dataInicioBR} a ${janelaAteBR})...`);
  const pedidosBrutos = await listarPedidos(conta, dataInicioBR, janelaAteBR, {});
  const pedidos = pedidosBrutos.map((b) => normalizarPedido(b)).filter(Boolean) as PedidoVenda[];
  const vendas = somarVendasDoMes(pedidos, mes, ETAPAS_VENDA);
  prog(`${vendas.pedidosConsiderados} pedidos faturados em ${mm[2]}/${mm[1]} (etapa ${[...ETAPAS_VENDA].join('/')}); ${vendas.pedidosCancelados} cancelados, ${vendas.pedidosForaEtapa} fora da etapa e ${vendas.pedidosForaDoMes} de outros meses ignorados`);

  // --- 3) preenche o template + monta resumo de conferencia ---
  return preencherTemplate({
    templateBuffer, mes, contaLabel, estoquePorCod, vendas,
    etapasVenda: [...ETAPAS_VENDA], dataInicioBR, dataFimBR, hoje: agora,
  });
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
