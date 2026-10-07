/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Parte PURA do "Arquivo Padrao - Estoque e Venda de Pecas" da Mahindra:
// le o template, decide o que e' venda do mes e preenche as colunas.
// Sem Omie, sem banco e sem env — testavel (ver __tests__/mahindra-preencher.test.ts).
// A casca que consulta a Omie e grava o historico fica em ./mahindra.ts.
//
// Regras que nasceram da auditoria de 01/10/2026 (arquivos de jun–set/2026):
//  1. VENDA DO MES = pedido faturado NO MES (infoCadastro.dFat). A janela do
//     ListarPedidos da Omie devolve pedido INCLUIDO OU ALTERADO no periodo, entao
//     pedido criado num mes e faturado no seguinte saia nos dois arquivos
//     (jun/26 +34 un, jul/26 +28 un). Aqui o corte e' em memoria, pela data.
//  2. CODIGO com e sem "RP-": a lista da Mahindra traz "RP-0734309419" e a Omie
//     tem o produto como "0734309419" (31 casos na NOVA, 3 cadastrados dos dois
//     jeitos). O saldo/venda da peca e' a SOMA das duas grafias.
//  3. CABECALHO: Mes/Ano e Concessionaria sao sempre regravados — template
//     reaproveitado do mes anterior saia com o mes errado.
//  4. Linha REPETIDA no template recebe o mesmo valor (o arquivo e' deles), mas
//     nao entra duas vezes nas somas da conferencia.
// ============================================================================

import * as XLSX from 'xlsx';
import { parseBR, fimMes, fmtBR } from './dates';

// referencia A1 de uma celula (coluna c, linha r) - ambos base 0
const ref = (c: number, r: number) => XLSX.utils.encode_cell({ c, r });

/** Normaliza um codigo de peca para comparacao (trim / upper / sem espacos). */
export function normCod(s: any): string {
  return String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, '');
}

const PREFIXO = 'RP-';

/**
 * Grafias aceitas para o mesmo codigo: a exata primeiro, depois a outra
 * (com "RP-" se veio sem, sem "RP-" se veio com).
 */
export function variantesCodigo(codigoNorm: string): string[] {
  if (!codigoNorm) return [];
  const outra = codigoNorm.startsWith(PREFIXO) ? codigoNorm.slice(PREFIXO.length) : PREFIXO + codigoNorm;
  return outra && outra !== codigoNorm ? [codigoNorm, outra] : [codigoNorm];
}

export interface TabelaInfo {
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

// ---------------------------------------------------------------------------
// Vendas do mes
// ---------------------------------------------------------------------------

/** O minimo que a soma de vendas precisa de um pedido (saida de normalizarPedido). */
export interface PedidoVenda {
  cancelada?: boolean;
  etapa?: string | null;
  /** DD/MM/YYYY — infoCadastro.dFat (so existe em pedido faturado). */
  dataFaturamento?: string | null;
  dataPrevisao?: string | null;
  dataInclusao?: string | null;
  itens?: Array<{ codigo?: string | null; qtde?: number | null }>;
}

/**
 * Data que diz em que mes o pedido conta (ISO YYYY-MM-DD): faturamento; sem
 * ele, a previsao de faturamento; sem ela, a inclusao.
 */
export function dataVendaPedido(ped: PedidoVenda): string | null {
  return parseBR(ped.dataFaturamento) || parseBR(ped.dataPrevisao) || parseBR(ped.dataInclusao);
}

export interface VendasDoMes {
  vendaPorCod: Map<string, number>;
  pedidosConsiderados: number;
  pedidosCancelados: number;
  pedidosForaEtapa: number;
  /** Vieram na janela da Omie mas pertencem a outro mes (ou nao tem data). */
  pedidosForaDoMes: number;
}

/**
 * Soma a quantidade vendida por codigo, contando SO pedido do mes `mes`
 * (AAAA-MM), nao cancelado e numa das etapas de venda. Cada pedido cai em
 * exatamente um mes — e' isso que impede a dupla contagem entre arquivos.
 */
export function somarVendasDoMes(pedidos: PedidoVenda[], mes: string, etapasVenda: Set<string>): VendasDoMes {
  const vendaPorCod = new Map<string, number>();
  let pedidosConsiderados = 0, pedidosCancelados = 0, pedidosForaEtapa = 0, pedidosForaDoMes = 0;
  for (const ped of pedidos) {
    if (!ped) continue;
    const data = dataVendaPedido(ped);
    if (!data || data.slice(0, 7) !== mes) { pedidosForaDoMes++; continue; }
    if (ped.cancelada) { pedidosCancelados++; continue; }
    if (!etapasVenda.has(String(ped.etapa))) { pedidosForaEtapa++; continue; }
    pedidosConsiderados++;
    for (const it of ped.itens || []) {
      const sku = it.codigo != null ? normCod(it.codigo) : '';
      if (!sku) continue;
      vendaPorCod.set(sku, (vendaPorCod.get(sku) || 0) + Number(it.qtde || 0));
    }
  }
  return { vendaPorCod, pedidosConsiderados, pedidosCancelados, pedidosForaEtapa, pedidosForaDoMes };
}

// ---------------------------------------------------------------------------
// Avisos de momento da geracao
// ---------------------------------------------------------------------------

/** Dias de folga depois do fechamento em que a posicao do mes ainda costuma mudar. */
export const DIAS_FOLGA_FECHAMENTO = 5;

/**
 * Avisos sobre QUANDO o arquivo esta sendo gerado. A posicao por data da Omie e'
 * retroativa: recebimento concluido depois, com data do mes, muda o saldo do
 * fim do mes (jun/26: +130 un entre gerar em 01/07 e em 04/08).
 */
export function avisosGeracao(mes: string, hoje: Date): string[] {
  const m = String(mes || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return [];
  const fim = fimMes(Number(m[1]), Number(m[2]));
  const dia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (dia.getTime() <= fim.getTime()) {
    return [`O mês de referência ainda não terminou (fecha em ${fmtBR(fim)}): estoque e vendas estão parciais. Gere de novo depois do fechamento.`];
  }
  const dias = Math.round((dia.getTime() - fim.getTime()) / 86400000);
  if (dias <= DIAS_FOLGA_FECHAMENTO) {
    return [`Gerado ${dias} dia(s) depois do fechamento. Entradas e pedidos do fim do mês ainda podem ser concluídos na Omie com data retroativa e mudar a posição. Confira ou gere de novo antes de enviar.`];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Cabecalho
// ---------------------------------------------------------------------------

const vazio = (cell: any) => !cell || cell.v == null || String(cell.v).trim() === '';

function gravar(sheet: XLSX.WorkSheet, c: number, r: number, value: string): void {
  sheet[ref(c, r)] = { t: 's', v: value };
}

/**
 * Preenche Concessionaria e Mes/Ano na celula a' direita do rotulo. Regrava
 * quando a celula esta vazia OU ja traz um valor do mesmo tipo (outro mes /
 * outra conta) — nunca apaga texto livre que o operador tenha posto ali.
 * Best-effort: nao quebra a geracao.
 */
export function preencherCabecalho(
  sheet: XLSX.WorkSheet,
  { concessionaria, mesAno, contasConhecidas = ['NOVA', 'CASTRO'] }: { concessionaria?: string; mesAno?: string; contasConhecidas?: string[] },
): void {
  try {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    const contas = contasConhecidas.map((s) => s.toUpperCase());
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[ref(c, r)];
        if (!cell || cell.v == null) continue;
        const t = String(cell.v).toUpperCase();
        // rotulo de verdade e' curto ("Concessionária:", "MÊS/ANO"); texto longo que
        // so menciona a palavra (instrucoes) nao autoriza sobrescrever o vizinho
        const rotuloCurto = t.trim().length <= 24;
        const alvo = sheet[ref(c + 1, r)];
        if (/CONCESSION/.test(t) && concessionaria) {
          const mesmoTipo = rotuloCurto && alvo && contas.includes(String(alvo.v).trim().toUpperCase());
          if (vazio(alvo) || mesmoTipo) gravar(sheet, c + 1, r, concessionaria);
        } else if (/M[ÊE]S\s*\/?\s*ANO/.test(t) && mesAno) {
          // "06/2026" digitado no Excel pode ter virado data (celula 'd', ou numero
          // serial com formato de data quando a planilha nao foi lida com cellDates)
          const ehData = !!alvo && (alvo.t === 'd' || alvo.v instanceof Date
            || (alvo.t === 'n' && typeof alvo.z === 'string' && XLSX.SSF.is_date(alvo.z)));
          const mesmoTipo = rotuloCurto && alvo
            && (ehData || /^\d{1,2}\s*\/\s*\d{4}$/.test(String(alvo.v).trim()));
          if (vazio(alvo) || mesmoTipo) gravar(sheet, c + 1, r, mesAno);
        }
      }
    }
  } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Preenchimento
// ---------------------------------------------------------------------------

export interface ResumoMahindra {
  mes: string;
  dataInicioBR: string;
  dataFimBR: string;
  sheetName: string;
  contaLabel: string;
  /** Linhas de peca do template (linha repetida conta como linha). */
  totalPecas: number;
  /** Linhas preenchidas. */
  encontradas: number;
  naoEncontrados: string[];
  /** Somas SEM contar duas vezes a linha repetida do template. */
  somaEstoque: number;
  somaVendida: number;
  etapasVenda: string[];
  pedidosConsiderados: number;
  pedidosCancelados: number;
  pedidosForaEtapa: number;
  negativos: Array<{ codigo: string; saldo: number }>;
  vendaSemEstoque: Array<{ codigo: string; vendida: number }>;
  // --- a partir de 01/10/2026 (arquivos antigos nao tem) ---
  /** Pedidos devolvidos pela Omie na janela mas faturados em outro mes. */
  pedidosForaDoMes?: number;
  /** 'faturamento' = venda contada pela data de faturamento do pedido. */
  criterioVenda?: string;
  /** Pecas casadas pela outra grafia do codigo (com/sem "RP-"). */
  casadosSemPrefixo?: Array<{ codigo: string; sku: string }>;
  /** Codigos que aparecem mais de uma vez no template. */
  codigosRepetidos?: string[];
  /** Avisos sobre o momento da geracao (mes aberto / recem-fechado). */
  avisos?: string[];
}

export interface PreencherArgs {
  templateBuffer: Buffer;
  /** AAAA-MM */
  mes: string;
  contaLabel: string;
  /** SKU normalizado -> saldo no fim do mes. */
  estoquePorCod: Map<string, { saldo: number }>;
  vendas: VendasDoMes;
  etapasVenda: string[];
  dataInicioBR: string;
  dataFimBR: string;
  /** Data da geracao (para os avisos). */
  hoje: Date;
}

export interface PreencherResult {
  buffer: Buffer;
  resumo: ResumoMahindra;
  filename: string;
}

/** Le o template e devolve a planilha + as linhas de peca. */
function lerLinhas(templateBuffer: Buffer) {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(templateBuffer, { type: 'buffer', cellStyles: true, cellDates: true }); }
  catch (e) { throw new Error('falha ao ler o template xlsx: ' + (e as Error).message); }
  const sheetName = (workbook.SheetNames || [])[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error('o template nao tem nenhuma planilha');

  const tab = localizarTabela(sheet);
  if (!tab) throw new Error('nao encontrei a tabela de pecas no template (preciso de um cabecalho com CODIGO, ESTOQUE e VENDIDA)');

  const linhas: Array<{ row: number; codigo: string; codigoNorm: string }> = [];
  for (let r = tab.headerRow + 1; r <= tab.range.e.r; r++) {
    const cell = sheet[ref(tab.codCol, r)];
    const cod = cell && cell.v != null ? String(cell.v).trim() : '';
    if (!cod) continue;
    if (!/[A-Za-z0-9]/.test(cod)) continue; // ignora celulas-lixo (ex.: "." solto no fim da planilha)
    linhas.push({ row: r, codigo: cod, codigoNorm: normCod(cod) });
  }
  if (linhas.length === 0) throw new Error('nenhum codigo de peca encontrado abaixo do cabecalho da tabela');
  return { workbook, sheet, sheetName, tab, linhas };
}

/** Quantas linhas de peca o template tem (para a mensagem de progresso). */
export function contarPecasTemplate(templateBuffer: Buffer): number {
  return lerLinhas(templateBuffer).linhas.length;
}

/**
 * Preenche QUANTIDADE DO ESTOQUE e QUANTIDADE VENDIDA no template e monta o
 * resumo de conferencia. Nao consulta nada: recebe o estoque e as vendas prontos.
 */
export function preencherTemplate(args: PreencherArgs): PreencherResult {
  const { templateBuffer, mes, contaLabel, estoquePorCod, vendas, etapasVenda, dataInicioBR, dataFimBR, hoje } = args;
  const mm = String(mes || '').match(/^(\d{4})-(\d{2})$/);
  if (!mm) throw new Error('mes de referencia invalido (use AAAA-MM)');

  const { workbook, sheet, sheetName, tab, linhas } = lerLinhas(templateBuffer);
  const { vendaPorCod } = vendas;

  let somaEstoque = 0, somaVendida = 0, preenchidas = 0;
  const naoEncontrados: string[] = [];
  const negativos: Array<{ codigo: string; saldo: number }> = [];
  const vendaSemEstoque: Array<{ codigo: string; vendida: number }> = [];
  const casadosSemPrefixo: Array<{ codigo: string; sku: string }> = [];
  const codigosRepetidos: string[] = [];
  const vistos = new Set<string>();

  for (const ln of linhas) {
    const repetido = vistos.has(ln.codigoNorm);
    vistos.add(ln.codigoNorm);
    if (repetido) codigosRepetidos.push(ln.codigo);

    // soma as grafias do codigo (com e sem "RP-") que existirem na Omie
    let existe = false, saldoReal = 0, vendida = 0;
    const outras: string[] = [];
    for (const v of variantesCodigo(ln.codigoNorm)) {
      const est = estoquePorCod.get(v);   // a posicao traz o produto mesmo com saldo 0
      const vend = vendaPorCod.get(v);
      if (!est && vend == null) continue;
      existe = true;
      if (v !== ln.codigoNorm) outras.push(v);
      if (est) saldoReal += Number(est.saldo || 0);
      if (vend != null) vendida += Number(vend);
    }
    if (!existe) {
      if (!repetido) naoEncontrados.push(ln.codigo);
      continue; // deixa as celulas em branco pro operador notar
    }

    // saldo negativo vira 0 no arquivo (a Mahindra nao aceita negativo), mas
    // continua listado em `negativos` pro operador conferir.
    const saldoArquivo = saldoReal < 0 ? 0 : saldoReal;
    sheet[ref(tab.estCol, ln.row)] = { t: 'n', v: saldoArquivo };
    sheet[ref(tab.vendCol, ln.row)] = { t: 'n', v: vendida };
    preenchidas++;
    if (repetido) continue; // mesma peca: nao entra de novo nas somas/listas

    somaEstoque += saldoArquivo; somaVendida += vendida;
    for (const sku of outras) casadosSemPrefixo.push({ codigo: ln.codigo, sku });
    if (saldoReal < 0) negativos.push({ codigo: ln.codigo, saldo: saldoReal });
    if (vendida > 0 && saldoArquivo === 0) vendaSemEstoque.push({ codigo: ln.codigo, vendida });
  }

  preencherCabecalho(sheet, { concessionaria: contaLabel, mesAno: `${mm[2]}/${mm[1]}` });

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true }) as Buffer;
  const resumo: ResumoMahindra = {
    mes, dataInicioBR, dataFimBR, sheetName, contaLabel,
    totalPecas: linhas.length,
    encontradas: preenchidas,
    naoEncontrados,
    somaEstoque, somaVendida,
    etapasVenda,
    pedidosConsiderados: vendas.pedidosConsiderados,
    pedidosCancelados: vendas.pedidosCancelados,
    pedidosForaEtapa: vendas.pedidosForaEtapa,
    negativos, vendaSemEstoque,
    pedidosForaDoMes: vendas.pedidosForaDoMes,
    criterioVenda: 'faturamento',
    casadosSemPrefixo,
    codigosRepetidos,
    avisos: avisosGeracao(mes, hoje),
  };
  const filename = `Estoque_Venda_Mahindra_${contaLabel}_${mes}.xlsx`;
  return { buffer, resumo, filename };
}
