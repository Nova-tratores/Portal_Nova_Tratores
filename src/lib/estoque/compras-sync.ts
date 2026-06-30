// Pipeline de ESCRITA de compras (NF-e de entrada do fornecedor) → Supabase.
// Portado de server.js: parseDataNFe, buscarNFeEntradaMes (ListarNF nfconsultar
// tpNF=0), buscarTodasNotasEntrada, buscarTodasContasPagar e a orquestração de
// /api/popular-compras (limpa + repopula compras_itens + notas_entrada, com
// enriquecimento de contas a pagar/categoria/nome do emitente).
//
// Roda por conta concreta. Reusa o estado de sync per-conta de admin.ts.

import { supabase } from './supabase';
import { omieRequest } from './omie';
import { parseDataBR, pad2, sleep, fmtD } from './utils';
import { getSyncState, resetSyncState } from './admin';
import { buscarCategoriasOmie, enriquecerNotasMes } from './notas-entrada';
import { getContasOmie, type Conta } from './conta';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;

/** Data NF-e ("dd/mm/aaaa" ou "aaaa-mm-ddThh:mm:ss") → "dd/mm/aaaa". */
function parseDataNFe(d: string | null | undefined): string {
  if (!d) return '';
  if (d.includes('T')) {
    const p = d.split('T')[0].split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  return d;
}

interface CompraItemRaw {
  codigo_produto: string;
  data_nota: string;
  numero_nf: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

interface NotaCompleta {
  ncod_nf: number | null;
  ncod_emp_emit: number | null;
  numero_nf: string;
  serie: string;
  modelo: string;
  data_emissao: string;
  data_registro: string;
  data_saida_entrada: string;
  hora_emissao: string;
  finalidade: string;
  tipo_pagamento: string;
  cancelada: string;
  emitente: Record<string, unknown> | null;
  destinatario: Record<string, unknown> | null;
  valor_produtos: number;
  valor_nf: number;
  valor_icms: number;
  valor_ipi: number;
  valor_pis: number;
  valor_cofins: number;
  valor_frete: number;
  valor_desconto: number;
  valor_total_tributos: number;
  itens: unknown[];
  parcelas: unknown[];
  pedido: unknown;
  complemento: unknown;
  info: unknown;
  _contas_pagar?: unknown[];
  _categoria?: string;
  _nome_emitente?: string;
}

// === Uma janela [deStr, ateStr] de NF-e de entrada (paginado) ===
async function buscarNFeEntradaMes(deStr: string, ateStr: string, conta: Conta): Promise<{ itens: CompraItemRaw[]; notasCompletas: NotaCompleta[] }> {
  const itens: CompraItemRaw[] = [];
  const notasCompletas: NotaCompleta[] = [];
  let pag = 1;
  while (true) {
    try {
      const r = await omieRequest<{ faultstring?: string; total_de_paginas?: number; nfCadastro?: Array<Record<string, unknown>> }>(
        'https://app.omie.com.br/api/v1/produtos/nfconsultar/', 'ListarNF',
        { pagina: pag, registros_por_pagina: 100, tpNF: '0', tpAmb: '1', dEmiInicial: deStr, dEmiFinal: ateStr },
        { conta },
      );
      if (r.faultstring) break;
      const notas = r.nfCadastro || [];
      if (notas.length === 0) break;
      notas.forEach((n) => {
        const ide = (n.ide || {}) as Record<string, unknown>;
        const dataRaw = String(ide.dhEmi || ide.dEmi || '');
        const data = parseDataNFe(dataRaw);
        const nf = String(ide.nNF || '');
        const detalhes = (n.det || []) as Array<Record<string, unknown>>;
        detalhes.forEach((d) => {
          const p = (d.prod || d) as Record<string, unknown>;
          itens.push({
            codigo_produto: String(p.cProd || ''),
            data_nota: data,
            numero_nf: nf,
            quantidade: num(p.qCom ?? p.qTrib),
            valor_unitario: num(p.vUnCom ?? p.vUnTrib),
            valor_total: num(p.vProd),
          });
        });
        const total = (n.total || {}) as Record<string, unknown>;
        const icms = (total.ICMSTot || {}) as Record<string, unknown>;
        const nfEmitInt = (n.nfEmitInt || {}) as Record<string, unknown>;
        notasCompletas.push({
          ncod_nf: (ide.nCodNF as number) || (n.nCodNF as number) || null,
          ncod_emp_emit: (nfEmitInt.nCodEmp as number) || null,
          numero_nf: nf,
          serie: String(ide.serie || ''),
          modelo: String(ide.mod || ''),
          data_emissao: data,
          data_registro: String(ide.dReg || ''),
          data_saida_entrada: String(ide.dSaiEnt || ''),
          hora_emissao: String(ide.hEmi || ''),
          finalidade: String(ide.finNFe || ''),
          tipo_pagamento: String(ide.indPag || ''),
          cancelada: String(ide.dCan || ''),
          emitente: n.emit || n.nfEmitInt ? Object.assign({}, (n.emit as object) || {}, nfEmitInt) : null,
          destinatario: (n.nfDestInt as Record<string, unknown>) || null,
          valor_produtos: num(icms.vProd),
          valor_nf: num(icms.vNF),
          valor_icms: num(icms.vICMS),
          valor_ipi: num(icms.vIPI),
          valor_pis: num(icms.vPIS),
          valor_cofins: num(icms.vCOFINS),
          valor_frete: num(icms.vFrete),
          valor_desconto: num(icms.vDesc),
          valor_total_tributos: num(icms.vTotTrib),
          itens: detalhes,
          parcelas: (n.titulos as unknown[]) || [],
          pedido: n.pedido || null,
          complemento: n.compl || null,
          info: n.info || null,
        });
      });
      const totalPag = r.total_de_paginas || 0;
      if (totalPag && pag >= totalPag) break;
      if (notas.length < 100) break;
      pag++;
      await sleep(3000);
    } catch {
      break;
    }
  }
  return { itens, notasCompletas };
}

type ProgressFn = (mesLabel: string, mesAtual: number, mesTotal: number, itensAteAgora: number) => void;

async function buscarTodasNotasEntrada(deStr: string, ateStr: string, conta: Conta, onProgress?: ProgressFn): Promise<{ itens: CompraItemRaw[]; notasCompletas: NotaCompleta[] }> {
  const todosItens: CompraItemRaw[] = [];
  const todasNotas: NotaCompleta[] = [];
  const dtDe = parseDataBR(deStr);
  const dtAte = parseDataBR(ateStr);
  const meses: Array<{ ini: string; fim: string; label: string }> = [];
  let cur = new Date(dtDe.getFullYear(), dtDe.getMonth(), 1);
  while (cur <= dtAte) {
    const ultimo = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const ini = pad2(cur.getDate()) + '/' + pad2(cur.getMonth() + 1) + '/' + cur.getFullYear();
    const fim = pad2(ultimo.getDate()) + '/' + pad2(ultimo.getMonth() + 1) + '/' + ultimo.getFullYear();
    meses.push({ ini, fim, label: pad2(cur.getMonth() + 1) + '/' + cur.getFullYear() });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  for (let i = 0; i < meses.length; i++) {
    const m = meses[i];
    if (onProgress) onProgress(m.label, i + 1, meses.length, todosItens.length);
    const resultado = await buscarNFeEntradaMes(m.ini, m.fim, conta);
    todosItens.push(...resultado.itens);
    todasNotas.push(...resultado.notasCompletas);
    if (i < meses.length - 1) await sleep(2000);
  }
  return { itens: todosItens, notasCompletas: todasNotas };
}

interface TituloRaw {
  numero_documento_fiscal?: string;
  numero_parcela?: string;
  data_vencimento?: string;
  data_emissao?: string;
  valor_documento?: number | string;
  status_titulo?: string;
  codigo_categoria?: string;
  codigo_cliente_fornecedor?: number;
  data_pagamento?: string;
  valor_pago?: number | string;
  pagamento?: { data_pagamento?: string; valor_pago?: number | string };
}

async function buscarTodasContasPagar(deStr: string, ateStr: string, conta: Conta): Promise<TituloRaw[]> {
  const todos: TituloRaw[] = [];
  let pag = 1;
  while (true) {
    try {
      const r = await omieRequest<{ faultstring?: string; total_de_paginas?: number; conta_pagar_cadastro?: TituloRaw[] }>(
        'https://app.omie.com.br/api/v1/financas/contapagar/', 'ListarContasPagar',
        { pagina: pag, registros_por_pagina: 500, filtrar_por_emissao_de: deStr, filtrar_por_emissao_ate: ateStr, filtrar_apenas_titulos_em_aberto: 'N' },
        { conta },
      );
      if (r.faultstring) break;
      const lista = r.conta_pagar_cadastro || [];
      if (lista.length === 0) break;
      lista.forEach((t) => todos.push(t));
      const totalPag = r.total_de_paginas || 0;
      if (totalPag && pag >= totalPag) break;
      if (lista.length < 500) break;
      pag++;
      await sleep(2000);
    } catch {
      break;
    }
  }
  return todos;
}

/** Meses (mes/ano) cobertos por uma janela DD/MM/YYYY → DD/MM/YYYY, inclusive. */
function mesesNoIntervalo(de: string, ate: string): Array<{ mes: number; ano: number }> {
  const pd = de.split('/').map(Number); // [DD, MM, YYYY]
  const pa = ate.split('/').map(Number);
  let y = pd[2], m = pd[1];
  const out: Array<{ mes: number; ano: number }> = [];
  while (y < pa[2] || (y === pa[2] && m <= pa[1])) {
    out.push({ mes: m, ano: y });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Apaga só os meses da janela (incremental), preservando o histórico restante. */
async function limparJanelaCompras(conta: Conta, de: string, ate: string): Promise<void> {
  for (const { mes, ano } of mesesNoIntervalo(de, ate)) {
    await supabase.from('compras_itens').delete().eq('conta_omie', conta).eq('ano', ano).eq('mes', mes);
    await supabase.from('notas_entrada').delete().eq('conta_omie', conta).eq('ano', ano).eq('mes', mes);
  }
}

// === Orquestração de uma conta (limpa + repopula + enriquece) ===
// janelaApenas=true: apaga só os meses de [de,ate] (incremental, p/ cron).
async function popularComprasConta(conta: Conta, de: string, ate: string, janelaApenas = false): Promise<void> {
  const s = getSyncState(conta);
  try {
    s.etapa = 'compras';
    s.mesAtual = 'iniciando...';
    if (janelaApenas) {
      await limparJanelaCompras(conta, de, ate);
    } else {
      await supabase.from('compras_itens').delete().eq('conta_omie', conta);
      await supabase.from('notas_entrada').delete().eq('conta_omie', conta);
    }

    const { itens, notasCompletas } = await buscarTodasNotasEntrada(de, ate, conta, (mesLabel, mesAtual, mesTotal, itensAteAgora) => {
      s.mesAtual = 'mes ' + mesLabel + ' (' + mesAtual + '/' + mesTotal + ') - ' + itensAteAgora + ' itens ate agora';
      s.atual = mesAtual;
      s.total = mesTotal;
    });

    // Mapeia cProd (código NF-e) → id_omie via Produtos_Completos
    s.mesAtual = 'mapeando codigos de produto...';
    const codMap: Record<string, string> = {};
    if (itens.length > 0) {
      const codsUnicos = [...new Set(itens.map((it) => it.codigo_produto))];
      for (let i = 0; i < codsUnicos.length; i += 50) {
        const lote = codsUnicos.slice(i, i + 50);
        const { data: prods } = await supabase.from('Produtos_Completos').select('id_omie,Codigo_Produto').eq('conta_omie', conta).in('Codigo_Produto', lote);
        if (prods) (prods as Array<{ id_omie: unknown; Codigo_Produto: unknown }>).forEach((p) => { codMap[String(p.Codigo_Produto)] = String(p.id_omie); });
      }
    }

    // Salva compras_itens
    s.mesAtual = 'salvando ' + itens.length + ' itens em compras_itens...';
    if (itens.length > 0) {
      const rows = itens.map((it) => {
        const dt = parseDataBR(it.data_nota);
        return {
          codigo_produto: codMap[it.codigo_produto] || it.codigo_produto,
          codigo_produto_nf: it.codigo_produto,
          data_nota: it.data_nota,
          numero_nf: it.numero_nf,
          quantidade: it.quantidade,
          valor_unitario: it.valor_unitario,
          valor_total: it.valor_total,
          mes: dt.getMonth() + 1,
          ano: dt.getFullYear(),
          conta_omie: conta,
        };
      });
      for (let i = 0; i < rows.length; i += 500) {
        await supabase.from('compras_itens').insert(rows.slice(i, i + 500));
      }
    }

    // Enriquecimento: contas a pagar + categorias + nome do emitente
    s.mesAtual = 'buscando contas a pagar...';
    const contasPagar = await buscarTodasContasPagar(de, ate, conta);
    s.mesAtual = 'buscando categorias...';
    const categoriasMap = await buscarCategoriasOmie(conta);

    const cpPorNF: Record<string, Array<Record<string, unknown>>> = {};
    const codsFornecedor = new Set<number>();
    contasPagar.forEach((t) => {
      const nfNum = String(t.numero_documento_fiscal || '').trim();
      if (nfNum) {
        if (!cpPorNF[nfNum]) cpPorNF[nfNum] = [];
        const catCod = t.codigo_categoria || '';
        const pag = t.pagamento || {};
        cpPorNF[nfNum].push({
          numero_parcela: t.numero_parcela || '',
          data_vencimento: t.data_vencimento || '',
          data_emissao: t.data_emissao || '',
          valor_documento: num(t.valor_documento),
          status_titulo: t.status_titulo || '',
          codigo_categoria: catCod,
          descricao_categoria: categoriasMap[catCod] || catCod,
          data_pagamento: pag.data_pagamento || t.data_pagamento || '',
          valor_pago: num(pag.valor_pago ?? t.valor_pago),
        });
      }
      if (t.codigo_cliente_fornecedor) codsFornecedor.add(t.codigo_cliente_fornecedor);
    });

    s.mesAtual = 'resolvendo nomes de fornecedores...';
    const nomeFornMap: Record<string, string> = {};
    const codsFornArr = [...codsFornecedor];
    for (let i = 0; i < codsFornArr.length; i += 50) {
      const lote = codsFornArr.slice(i, i + 50);
      const { data: clientes } = await supabase.from('Clientes_Omie').select('id,nome').in('id', lote);
      if (clientes) (clientes as Array<{ id: unknown; nome?: string }>).forEach((c) => { if (c.nome) nomeFornMap[String(c.id)] = c.nome; });
    }
    const codsEmit = [...new Set(notasCompletas.map((n) => n.ncod_emp_emit).filter(Boolean))] as number[];
    for (let i = 0; i < codsEmit.length; i += 50) {
      const lote = codsEmit.slice(i, i + 50);
      const { data: clientes } = await supabase.from('Clientes_Omie').select('id,nome').in('id', lote);
      if (clientes) (clientes as Array<{ id: unknown; nome?: string }>).forEach((c) => { if (c.nome) nomeFornMap[String(c.id)] = c.nome; });
    }

    notasCompletas.forEach((n) => {
      const nfNum = String(n.numero_nf || '').trim();
      const cp = cpPorNF[nfNum] || [];
      n._contas_pagar = cp;
      if (cp.length > 0 && cp[0].descricao_categoria) n._categoria = String(cp[0].descricao_categoria);
      if (cp.length > 0) {
        const codForn = contasPagar.find((t) => String(t.numero_documento_fiscal || '').trim() === nfNum);
        if (codForn?.codigo_cliente_fornecedor && nomeFornMap[String(codForn.codigo_cliente_fornecedor)]) {
          n._nome_emitente = nomeFornMap[String(codForn.codigo_cliente_fornecedor)];
        }
      }
      if (!n._nome_emitente && n.ncod_emp_emit && nomeFornMap[String(n.ncod_emp_emit)]) {
        n._nome_emitente = nomeFornMap[String(n.ncod_emp_emit)];
      }
    });

    // Salva notas_entrada
    s.mesAtual = 'salvando ' + notasCompletas.length + ' notas em notas_entrada...';
    if (notasCompletas.length > 0) {
      const notaRows = notasCompletas.map((n) => {
        const dt = parseDataBR(n.data_emissao);
        return {
          ncod_nf: n.ncod_nf, numero_nf: n.numero_nf, serie: n.serie, modelo: n.modelo,
          data_emissao: n.data_emissao, data_registro: n.data_registro, data_saida_entrada: n.data_saida_entrada,
          hora_emissao: n.hora_emissao, finalidade: n.finalidade, tipo_pagamento: n.tipo_pagamento, cancelada: n.cancelada,
          emitente: n.emitente, destinatario: n.destinatario,
          valor_produtos: n.valor_produtos, valor_nf: n.valor_nf, valor_icms: n.valor_icms, valor_ipi: n.valor_ipi,
          valor_pis: n.valor_pis, valor_cofins: n.valor_cofins, valor_frete: n.valor_frete, valor_desconto: n.valor_desconto,
          valor_total_tributos: n.valor_total_tributos, itens: n.itens, parcelas: n.parcelas, pedido: n.pedido,
          complemento: n.complemento, info: n.info,
          contas_pagar: n._contas_pagar || [], categoria: n._categoria || null, nome_emitente: n._nome_emitente || null,
          mes: dt.getMonth() + 1, ano: dt.getFullYear(), conta_omie: conta,
        };
      });
      for (let i = 0; i < notaRows.length; i += 100) {
        await supabase.from('notas_entrada').insert(notaRows.slice(i, i + 100));
      }
    }

    s.etapa = 'finalizado';
    s.mesAtual = '';
    s.finalizado = true;
    s.finalizadoEm = new Date().toISOString();
  } catch (e) {
    s.erro = 'Fatal: ' + (e as Error).message;
  } finally {
    s.rodando = false;
  }
}

/**
 * Dispara o popular-compras em background para as contas alvo (lock per-conta).
 * Período: 01/01/2023 até hoje (mesmo do monolito). Portado de /api/popular-compras.
 */
export function iniciarPopularCompras(contasAlvo: Conta[]): { contasIniciadas: Conta[]; contasPuladas: Conta[] } {
  const de = '01/01/2023';
  const ate = fmtD(new Date());
  const validas = contasAlvo.length > 0 ? contasAlvo : getContasOmie().map((c) => c.id);
  const aIniciar = validas.filter((c) => !getSyncState(c).rodando);
  const puladas = validas.filter((c) => getSyncState(c).rodando);

  aIniciar.forEach((conta) => {
    resetSyncState(conta);
    const s = getSyncState(conta);
    s.rodando = true;
    s.etapa = 'compras';
  });

  // Fire-and-forget por conta (paralelo — rate limit Omie é por chave).
  aIniciar.forEach((conta) => {
    popularComprasConta(conta, de, ate).catch((e) => {
      const s = getSyncState(conta);
      s.erro = 'Fatal: ' + (e as Error).message;
      s.rodando = false;
    });
  });

  return { contasIniciadas: aIniciar, contasPuladas: puladas };
}

/**
 * Sync INCREMENTAL de uma conta: re-busca só os últimos `mesesAtras` meses da
 * Omie e regrava só esses meses (preserva o histórico). Atualiza o vínculo
 * nfProdInt.nCodProd dos itens que foram associados desde o último sync.
 * Aguarda a conclusão (uso em cron). Respeita o lock per-conta.
 */
export async function sincronizarComprasJanela(conta: Conta, mesesAtras = 3): Promise<{ conta: Conta; ok: boolean; erro?: string; enriquecidos?: number }> {
  if (getSyncState(conta).rodando) return { conta, ok: false, erro: 'sync ja rodando' };
  resetSyncState(conta);
  const s = getSyncState(conta);
  s.rodando = true;
  s.etapa = 'compras';
  const now = new Date();
  const de = fmtD(new Date(now.getFullYear(), now.getMonth() - Math.max(0, mesesAtras - 1), 1));
  const ate = fmtD(now);
  try {
    await popularComprasConta(conta, de, ate, true);
    // Auto-heal: o delete+insert zera nome_emitente/categoria; reenriquece a janela
    // (sequencial por mês p/ não conflitar com o lock per-conta do enriquecimento).
    let enriquecidos = 0;
    for (const { mes, ano } of mesesNoIntervalo(de, ate)) {
      try {
        const r = await enriquecerNotasMes(mes, ano, conta);
        enriquecidos += (r.emitentes_preenchidos || 0) + (r.categorias_preenchidas || 0);
      } catch { /* segue p/ o próximo mês */ }
    }
    return { conta, ok: true, enriquecidos };
  } catch (e) {
    s.erro = 'Fatal: ' + (e as Error).message;
    s.rodando = false;
    return { conta, ok: false, erro: (e as Error).message };
  }
}
