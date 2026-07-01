// Sync Omie -> Supabase das tabelas que alimentam a tela Remessas do Visual
// Estoque. Portado do app legado (omie-api.js): sincronizarRemessas +
// syncMovimentacaoProdutos + syncOutrasEntradas. Adaptado para a infra do portal
// (omieRequest por opts, cliente service-role, conta_omie em MINÚSCULO).
//
// NÃO portado nesta passagem (melhoria futura): a detecção avançada de devoluções
// via MovimentoEstoque (cruzarDevolucoes/verificarSuspeitas) — depende de nomes de
// campos Omie incertos. Os status Devolvida/Retorno/Suspeita já gravados no banco
// são PRESERVADOS pelo upsert (não são sobrescritos).

import { omieRequest, type OmieRequestOpts } from '../estoque/omie';
import { type Conta } from '../estoque/conta';
import { supabase } from '../estoque/supabase';
import { sleep } from '../estoque/utils';

const API_DELAY = 1200;
const OMIE_OPTS = (conta: Conta): OmieRequestOpts => ({ conta, retries: 3, maxWaitMs: 60_000 });

// conta_omie nas tabelas remessas/movimentacao_produtos/outras_entradas é minúsculo.
function contaLow(c: Conta): string {
  return String(c).toLowerCase();
}

// Trava em memória para evitar runs concorrentes batendo na Omie.
let syncEmAndamento = false;

interface ClienteInfo { nome: string; cnpj: string }

async function buscarClientesOmie(conta: Conta): Promise<Record<number, ClienteInfo>> {
  const mapa: Record<number, ClienteInfo> = {};
  let pagina = 1;
  let totalPaginas = 1;
  while (pagina <= totalPaginas) {
    const data = await omieRequest<{ total_de_paginas?: number; clientes_cadastro?: any[] }>(
      '/geral/clientes/', 'ListarClientes',
      { pagina, registros_por_pagina: 500, apenas_importado_api: 'N' },
      OMIE_OPTS(conta),
    );
    if (data.total_de_paginas) totalPaginas = data.total_de_paginas;
    const lista = data.clientes_cadastro || [];
    if (lista.length === 0) break;
    for (const c of lista) {
      mapa[c.codigo_cliente_omie] = { nome: c.nome_fantasia || c.razao_social || '', cnpj: c.cnpj_cpf || '' };
    }
    pagina++;
    if (pagina <= totalPaginas) await sleep(API_DELAY);
  }
  return mapa;
}

// Mapa codigo_produto -> descricao (da tabela produtos).
async function carregarMapaProdutos(): Promise<Record<string, string>> {
  const mapa: Record<string, string> = {};
  let from = 0;
  while (true) {
    const { data } = await supabase.from('produtos').select('codigo_produto,descricao').range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const p of data) mapa[String(p.codigo_produto)] = p.descricao || '';
    if (data.length < 1000) break;
    from += 1000;
  }
  return mapa;
}

function extrairRemessa(rem: any, clientesMap: Record<number, ClienteInfo>, produtosMap: Record<string, string>) {
  const cabec = rem.cabec || {};
  const infAdic = rem.infAdic || {};
  const id = cabec.nCodRem;
  if (!id) return null;

  const itens = (rem.produtos || []).map((item: any) => {
    const codProd = String(item.nCodProd || '');
    const desc = produtosMap[codProd] || (codProd ? 'Produto #' + codProd : '');
    const qtde = Number(item.nQtde || 1);
    const valUnit = Number(item.nValUnit || 0);
    return { cDescricao: desc, nQtde: qtde, nValUnit: valUnit, nValorTotal: qtde * valUnit, cNCM: item.cNCM || '', cCFOP: item.cCFOP || '', nCodProduto: codProd };
  });

  let status = 'Aberta';
  if (cabec.cCancelado === 'S') status = 'Cancelada';
  else if (cabec.faturada === 'S') status = 'Faturada';

  const clienteInfo = clientesMap[cabec.nCodCli] || { nome: '', cnpj: '' };

  return {
    id_remessa: id,
    numero_nfe: cabec.cNumeroRemessa || '',
    serie_nfe: '',
    chave_nfe: '',
    emissao: cabec.dPrevisao || '',
    natureza: infAdic.cDadosAdic || '',
    cfop: itens[0]?.cCFOP || '',
    status,
    destinatario: clienteInfo.nome,
    destinatario_cnpj: clienteInfo.cnpj,
    total_nfe: Number(cabec.nValorTotal || 0),
    itens,
    qtd_itens: itens.length,
    atualizado_em: new Date().toISOString(),
  };
}

// ============================================================
// SYNC: ListarRemessas -> remessas
// ============================================================
export async function sincronizarRemessas(conta: Conta): Promise<{ ok: boolean; total?: number; mensagem?: string }> {
  if (syncEmAndamento) return { ok: false, mensagem: 'Sync já em andamento' };
  syncEmAndamento = true;
  const low = contaLow(conta);
  try {
    const clientesMap = await buscarClientesOmie(conta);
    await sleep(API_DELAY);
    const produtosMap = await carregarMapaProdutos();

    let pagina = 1;
    let totalPaginas = 1;
    let totalSalvos = 0;
    const statusProtegidos = new Set(['Devolvida', 'Retorno', 'Suspeita']);

    while (pagina <= totalPaginas) {
      const data = await omieRequest<{ nTotalPaginas?: number; remessas?: any[]; remessaCadastro?: any[]; cadastros?: any[] }>(
        '/produtos/remessa/', 'ListarRemessas',
        { nPagina: pagina, nRegistrosPorPagina: 50 },
        OMIE_OPTS(conta),
      );
      if (data.nTotalPaginas) totalPaginas = data.nTotalPaginas;
      const lista = data.remessas || data.remessaCadastro || data.cadastros || [];
      if (lista.length === 0) break;

      const rows = lista.map((r) => extrairRemessa(r, clientesMap, produtosMap)).filter(Boolean) as any[];
      rows.forEach((r) => { r.conta_omie = low; });

      if (rows.length > 0) {
        // Preserva status protegidos já gravados.
        const ids = rows.map((r) => r.id_remessa);
        const { data: existentes } = await supabase.from('remessas').select('id_remessa,status').eq('conta_omie', low).in('id_remessa', ids);
        const statusMap: Record<number, string> = {};
        for (const e of existentes || []) statusMap[e.id_remessa] = e.status;
        for (const row of rows) {
          const atual = statusMap[row.id_remessa];
          if (atual && statusProtegidos.has(atual)) row.status = atual;
        }
        const { error } = await supabase.from('remessas').upsert(rows, { onConflict: 'id_remessa,conta_omie' });
        if (error) console.error('SYNC REMESSAS upsert erro:', error.message);
        else totalSalvos += rows.length;
      }

      pagina++;
      if (pagina <= totalPaginas) await sleep(API_DELAY);
    }
    return { ok: true, total: totalSalvos };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  } finally {
    syncEmAndamento = false;
  }
}

// ============================================================
// SYNC: movimentacao_produtos (pendentes a partir das remessas de saída)
// ============================================================
export async function sincronizarMovimentacao(conta: Conta): Promise<{ ok: boolean; registros?: number; mensagem?: string }> {
  if (syncEmAndamento) return { ok: false, mensagem: 'Sync já em andamento' };
  syncEmAndamento = true;
  const low = contaLow(conta);
  try {
    const cfopsSaida = ['5.912', '6.912'];
    let remessas: any[] = [];
    let from = 0;
    while (true) {
      const { data: page } = await supabase
        .from('remessas')
        .select('id_remessa,numero_nfe,itens,emissao,destinatario,destinatario_cnpj')
        .eq('conta_omie', low)
        .in('cfop', cfopsSaida)
        .neq('status', 'Cancelada')
        .range(from, from + 999);
      if (!page || page.length === 0) break;
      remessas = remessas.concat(page);
      if (page.length < 1000) break;
      from += 1000;
    }
    if (remessas.length === 0) return { ok: true, registros: 0 };

    const parseItens = (itens: any): any[] => {
      if (Array.isArray(itens)) return itens;
      if (typeof itens === 'string') { try { return JSON.parse(itens); } catch { return []; } }
      return [];
    };

    const registros: any[] = [];
    for (const rem of remessas) {
      for (const item of parseItens(rem.itens)) {
        const cod = String(item.nCodProduto || '');
        if (!cod) continue;
        registros.push({
          cod_produto: cod,
          descricao_produto: item.cDescricao || '',
          id_remessa: rem.id_remessa,
          numero_remessa: rem.numero_nfe || '',
          data_saida: rem.emissao || '',
          destinatario: rem.destinatario || '',
          destinatario_cnpj: rem.destinatario_cnpj || '',
          valor_unitario: Number(item.nValUnit || 0),
          qtde: Number(item.nQtde || 1),
          status: 'Pendente',
          atualizado_em: new Date().toISOString(),
          conta_omie: low,
        });
      }
    }

    // Upsert preservando status 'Devolvida' já existentes.
    let inseridos = 0;
    for (let i = 0; i < registros.length; i += 100) {
      const batch = registros.slice(i, i + 100);
      const ids = batch.map((r) => r.id_remessa);
      const { data: existentes } = await supabase
        .from('movimentacao_produtos').select('cod_produto,id_remessa,status')
        .eq('conta_omie', low).in('id_remessa', ids);
      const protegido = new Set((existentes || []).filter((e) => e.status === 'Devolvida').map((e) => `${e.cod_produto}|${e.id_remessa}`));
      const aSalvar = batch.filter((r) => !protegido.has(`${r.cod_produto}|${r.id_remessa}`));
      if (aSalvar.length > 0) {
        const { error } = await supabase.from('movimentacao_produtos').upsert(aSalvar, { onConflict: 'cod_produto,id_remessa,conta_omie' });
        if (!error) inseridos += aSalvar.length;
      }
    }
    return { ok: true, registros: inseridos };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  } finally {
    syncEmAndamento = false;
  }
}

// ============================================================
// SYNC: ListarNotaEnt -> outras_entradas
// ============================================================
export async function sincronizarOutrasEntradas(conta: Conta): Promise<{ ok: boolean; total?: number; mensagem?: string }> {
  if (syncEmAndamento) return { ok: false, mensagem: 'Sync já em andamento' };
  syncEmAndamento = true;
  const low = contaLow(conta);
  try {
    const clientesMap = await buscarClientesOmie(conta);
    await sleep(API_DELAY);

    let pag = 1;
    let totalPag = 1;
    const registros: any[] = [];
    while (pag <= totalPag) {
      const dataNE = await omieRequest<{ nTotalPaginas?: number; notas?: any[] }>(
        '/produtos/notaentrada/', 'ListarNotaEnt',
        { nPagina: pag, nRegistrosPorPagina: 500, cExibirDetalhes: 'S' },
        OMIE_OPTS(conta),
      );
      if (dataNE.nTotalPaginas) totalPag = dataNE.nTotalPaginas;
      const lista = dataNE.notas || [];
      if (lista.length === 0) break;

      for (const ne of lista) {
        const cabec = ne.cabec || {};
        const produtos = ne.produtos || ne.det || ne.itens || [];
        const cfop = produtos.length > 0 ? String(produtos[0].cCFOP || '') : '';
        const itens = produtos.map((p: any) => {
          const qtde = Number(p.nQtde || p.qCom || 1);
          const valUnit = Number(p.nValUnit || p.vUnCom || 0);
          return {
            cDescricao: p.xProd || p.cDescricao || p.descricao || '',
            nCodProduto: String(p.nCodProd || p.nCodProduto || p.cCodInt || ''),
            cProd: String(p.cProd || ''),
            cCFOP: String(p.cCFOP || ''),
            nQtde: qtde, nValUnit: valUnit, nValorTotal: qtde * valUnit,
          };
        });
        const totalNfe = itens.reduce((s: number, i: any) => s + i.nValorTotal, 0);
        const clienteInfo = clientesMap[cabec.nCodCli] || { nome: '' };
        registros.push({
          id_nota_entrada: cabec.nCodNotaEnt,
          numero_nfe: cabec.cNumeroNotaEnt || '',
          data_emissao: cabec.dPrevisao || '',
          cfop,
          cod_cliente: cabec.nCodCli || null,
          destinatario: clienteInfo.nome,
          total_nfe: totalNfe,
          produtos: itens,
          qtd_itens: itens.length,
          atualizado_em: new Date().toISOString(),
          conta_omie: low,
        });
      }
      pag++;
      if (pag <= totalPag) await sleep(API_DELAY);
    }

    for (let i = 0; i < registros.length; i += 100) {
      await supabase.from('outras_entradas').upsert(registros.slice(i, i + 100), { onConflict: 'id_nota_entrada,conta_omie' });
    }
    return { ok: true, total: registros.length };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  } finally {
    syncEmAndamento = false;
  }
}

// ============================================================
// DEVOLUÇÕES: cruza Notas de Entrada (cOperacao=24 / CFOP 1.913/2.913) com
// remessas de saída pendentes e marca status 'Retorno'/'Devolvida'.
// Porta cruzarDevolucoes do app legado.
// ============================================================
function parseItensJson(itens: any): any[] {
  if (Array.isArray(itens)) return itens;
  if (typeof itens === 'string') { try { return JSON.parse(itens); } catch { return []; } }
  return [];
}

export async function cruzarDevolucoes(conta: Conta): Promise<{ ok: boolean; devolvidas?: number; retornos?: number; mensagem?: string }> {
  if (syncEmAndamento) return { ok: false, mensagem: 'Sync já em andamento' };
  syncEmAndamento = true;
  const low = contaLow(conta);
  try {
    const cfopsRetorno = ['5.913', '6.913'];
    const cfopsSaida = ['5.912', '6.912'];
    const cfopsRetornoEntrada = ['1.913', '2.913', '1913', '2913'];

    // 1. Remessas CFOP 5.913/6.913 -> Retorno
    let retornosCount = 0;
    const { data: retornos } = await supabase.from('remessas').select('id_remessa').eq('conta_omie', low).in('cfop', cfopsRetorno).neq('status', 'Cancelada');
    if (retornos && retornos.length > 0) {
      const ids = retornos.map((r) => r.id_remessa);
      await supabase.from('remessas').update({ status: 'Retorno' }).in('id_remessa', ids);
      retornosCount = ids.length;
    }

    // 2. Remessas de saída pendentes (não Devolvida/Retorno/Cancelada)
    let remessas: any[] = [];
    let from = 0;
    while (true) {
      const { data: page } = await supabase
        .from('remessas').select('id_remessa,itens')
        .eq('conta_omie', low).in('cfop', cfopsSaida)
        .not('status', 'in', '("Devolvida","Retorno","Cancelada")')
        .range(from, from + 999);
      if (!page || page.length === 0) break;
      remessas = remessas.concat(page);
      if (page.length < 1000) break;
      from += 1000;
    }
    if (remessas.length === 0) return { ok: true, devolvidas: 0, retornos: retornosCount };

    // 3a. Notas de Entrada com cOperacao=24 (mais confiável)
    const codsOp24 = new Set<string>();
    try {
      let pag = 1, totalPag = 1;
      while (pag <= totalPag) {
        const d = await omieRequest<{ nTotalPaginas?: number; notas?: any[] }>(
          '/produtos/notaentrada/', 'ListarNotaEnt',
          { nPagina: pag, nRegistrosPorPagina: 500, cExibirDetalhes: 'S', cOperacao: '24' },
          OMIE_OPTS(conta),
        );
        if (d.nTotalPaginas) totalPag = d.nTotalPaginas;
        const lista = d.notas || [];
        if (lista.length === 0) break;
        for (const ne of lista) for (const p of (ne.produtos || ne.det || ne.itens || [])) {
          const cod = String(p.nCodProd || p.nCodProduto || p.nCodItem || '');
          if (cod) codsOp24.add(cod);
        }
        pag++;
        if (pag <= totalPag) await sleep(API_DELAY);
      }
    } catch {
      // cOperacao=24 pode não ser suportado como filtro — segue para o fallback.
    }

    // 3b. Todas as Notas de Entrada filtrando CFOP 1.913/2.913
    const codsEntrada = new Set<string>();
    let pagNE = 1, totalPagNE = 1;
    while (pagNE <= totalPagNE) {
      const d = await omieRequest<{ nTotalPaginas?: number; notas?: any[] }>(
        '/produtos/notaentrada/', 'ListarNotaEnt',
        { nPagina: pagNE, nRegistrosPorPagina: 500, cExibirDetalhes: 'S' },
        OMIE_OPTS(conta),
      );
      if (d.nTotalPaginas) totalPagNE = d.nTotalPaginas;
      const lista = d.notas || [];
      if (lista.length === 0) break;
      for (const ne of lista) for (const p of (ne.produtos || ne.det || ne.itens || [])) {
        if (cfopsRetornoEntrada.includes(String(p.cCFOP || p.cfop || p.CFOP || ''))) {
          const cod = String(p.nCodProd || p.nCodProduto || p.nCodItem || '');
          if (cod) codsEntrada.add(cod);
        }
      }
      pagNE++;
      if (pagNE <= totalPagNE) await sleep(API_DELAY);
    }

    // 3c. Também olhar recebimentos_nfe já salvos
    let fromR = 0;
    while (true) {
      const { data: recebPage } = await supabase.from('recebimentos_nfe').select('produtos').neq('status', 'Cancelada').range(fromR, fromR + 999);
      if (!recebPage || recebPage.length === 0) break;
      for (const r of recebPage) for (const p of parseItensJson(r.produtos)) {
        if (cfopsRetornoEntrada.includes(String(p.cCFOP || ''))) {
          const cod = String(p.nCodProduto || '');
          if (cod) codsEntrada.add(cod);
        }
      }
      if (recebPage.length < 1000) break;
      fromR += 1000;
    }

    if (codsOp24.size === 0 && codsEntrada.size === 0) return { ok: true, devolvidas: 0, retornos: retornosCount };

    // 4a. Cruza por cOperacao=24
    const devolvidas24: number[] = [];
    if (codsOp24.size > 0) {
      for (const rem of remessas) {
        if (parseItensJson(rem.itens).some((i: any) => codsOp24.has(String(i.nCodProduto || '')))) devolvidas24.push(rem.id_remessa);
      }
      for (let i = 0; i < devolvidas24.length; i += 100) {
        await supabase.from('remessas').update({ status: 'Devolvida' }).in('id_remessa', devolvidas24.slice(i, i + 100));
      }
    }

    // 4b. Cruza por CFOP 1.913/2.913 (fallback)
    const ja = new Set(devolvidas24);
    const devolvidasCfop: number[] = [];
    if (codsEntrada.size > 0) {
      for (const rem of remessas) {
        if (ja.has(rem.id_remessa)) continue;
        if (parseItensJson(rem.itens).some((i: any) => codsEntrada.has(String(i.nCodProduto || '')))) devolvidasCfop.push(rem.id_remessa);
      }
      for (let i = 0; i < devolvidasCfop.length; i += 100) {
        await supabase.from('remessas').update({ status: 'Devolvida' }).in('id_remessa', devolvidasCfop.slice(i, i + 100));
      }
    }

    return { ok: true, devolvidas: devolvidas24.length + devolvidasCfop.length, retornos: retornosCount };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  } finally {
    syncEmAndamento = false;
  }
}

// ============================================================
// SUSPEITAS: para remessas pendentes > R$20k, consulta MovimentoEstoque de cada
// produto; se houve ENTRADA após a saída, marca 'Suspeita' + nota_devolucao.
// Porta verificarSuspeitas do app legado. PESADO (1 chamada Omie por produto) —
// rodar via cron, não em request HTTP.
// ============================================================
function parseDateBR(d: string): Date | null {
  if (!d) return null;
  const p = d.split('/');
  if (p.length === 3) return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
  return new Date(d);
}
function formatDateBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export async function verificarSuspeitas(conta: Conta): Promise<{ ok: boolean; suspeitas?: number; mensagem?: string }> {
  if (syncEmAndamento) return { ok: false, mensagem: 'Sync já em andamento' };
  syncEmAndamento = true;
  const low = contaLow(conta);
  try {
    const cfopsSaida = ['5.912', '6.912'];
    const VALOR_MINIMO = 20000;

    let remessas: any[] = [];
    let from = 0;
    while (true) {
      const { data: page } = await supabase
        .from('remessas').select('id_remessa,itens,emissao,total_nfe,destinatario')
        .eq('conta_omie', low).in('cfop', cfopsSaida)
        .not('status', 'in', '("Devolvida","Retorno","Cancelada")')
        .gte('total_nfe', VALOR_MINIMO)
        .range(from, from + 999);
      if (!page || page.length === 0) break;
      remessas = remessas.concat(page);
      if (page.length < 1000) break;
      from += 1000;
    }
    if (remessas.length === 0) return { ok: true, suspeitas: 0 };

    const hoje = formatDateBR(new Date());
    const remessaInfo: Record<number, { emissao: Date }> = {};
    const produtoRemessas: Record<string, Set<number>> = {};
    for (const rem of remessas) {
      const dataRem = parseDateBR(rem.emissao);
      if (!dataRem) continue;
      remessaInfo[rem.id_remessa] = { emissao: dataRem };
      for (const item of parseItensJson(rem.itens)) {
        const cod = String(item.nCodProduto || '');
        if (!cod) continue;
        if (!produtoRemessas[cod]) produtoRemessas[cod] = new Set();
        produtoRemessas[cod].add(rem.id_remessa);
      }
    }

    // Mapa idDoc -> numero NF (notas entrada + recebimentos + remessas).
    const docNumeroMap: Record<string, string> = {};
    let pagNE = 1, totalPagNE = 1;
    while (pagNE <= totalPagNE) {
      const d = await omieRequest<{ nTotalPaginas?: number; notas?: any[] }>(
        '/produtos/notaentrada/', 'ListarNotaEnt', { nPagina: pagNE, nRegistrosPorPagina: 500 }, OMIE_OPTS(conta),
      );
      if (d.nTotalPaginas) totalPagNE = d.nTotalPaginas;
      const lista = d.notas || [];
      if (lista.length === 0) break;
      for (const ne of lista) {
        const id = ne.cabec?.nCodNotaEnt;
        const num = ne.cabec?.cNumeroNotaEnt || ne.cabec?.cNumeroNFe || '';
        if (id && num) docNumeroMap[id] = num;
      }
      pagNE++;
      if (pagNE <= totalPagNE) await sleep(API_DELAY);
    }
    for (const tabela of [{ t: 'recebimentos_nfe', id: 'id_receb' }, { t: 'remessas', id: 'id_remessa' }]) {
      let fr = 0;
      while (true) {
        const { data: page } = await supabase.from(tabela.t).select(`${tabela.id},numero_nfe`).range(fr, fr + 999);
        if (!page || page.length === 0) break;
        for (const r of page as any[]) { if (r[tabela.id] && r.numero_nfe) docNumeroMap[r[tabela.id]] = r.numero_nfe; }
        if (page.length < 1000) break;
        fr += 1000;
      }
    }

    // Consulta MovimentoEstoque por produto.
    const codsEntradaLocal = ['RRE', 'NFC', 'RDE', 'AJE', 'RDV'];
    const codsSaidaLocal = ['REM', 'NFV', 'NFS', 'RSD', 'VND'];
    const suspeitasMap: Record<number, { docId: string; idPedido: string; dtMov: string; codOrig: string; desOrig: string }> = {};
    const produtos = Object.keys(produtoRemessas);

    for (const codProd of produtos) {
      const remIds = [...produtoRemessas[codProd]];
      let dataMin: Date | null = null;
      for (const rid of remIds) { const d = remessaInfo[rid]?.emissao; if (d && (!dataMin || d < dataMin)) dataMin = d; }
      if (!dataMin) continue;
      try {
        const resp = await omieRequest<{ movProduto?: any[]; movimentos?: any[] }>(
          '/estoque/consulta/', 'MovimentoEstoque',
          { id_prod: Number(codProd), dataInicial: formatDateBR(dataMin), dataFinal: hoje },
          OMIE_OPTS(conta),
        );
        const movimentos = resp.movProduto || resp.movimentos || [];
        const movEntrada = movimentos.find((mov: any) => {
          const cod = (mov.codOrigem || '').toUpperCase();
          return codsEntradaLocal.includes(cod) || (!codsSaidaLocal.includes(cod) && String(mov.tipo || '').toUpperCase() === 'E');
        });
        if (movEntrada) {
          for (const rid of remIds) {
            if (!suspeitasMap[rid]) {
              suspeitasMap[rid] = {
                docId: movEntrada.idDoc || '', idPedido: movEntrada.idPedido || '',
                dtMov: movEntrada.dtMov || '', codOrig: (movEntrada.codOrigem || '').toUpperCase(),
                desOrig: movEntrada.desOrigem || movEntrada.codOrigem || '',
              };
            }
          }
        }
        await sleep(API_DELAY);
      } catch {
        await sleep(API_DELAY);
      }
    }

    // Monta nota_devolucao e atualiza.
    const idsSuspeitas = Object.keys(suspeitasMap);
    for (const id of idsSuspeitas) {
      const info = suspeitasMap[Number(id)];
      const numNF = docNumeroMap[info.docId] || docNumeroMap[info.idPedido] || '';
      const direcao = codsEntradaLocal.includes(info.codOrig) ? 'ENTRADA' : codsSaidaLocal.includes(info.codOrig) ? 'SAIDA' : info.codOrig;
      const notaStr = numNF ? `[${direcao}] NF ${numNF} (${info.dtMov}) - ${info.desOrig}` : `[${direcao}] Doc ${info.docId} (${info.dtMov}) - ${info.desOrig}`;
      await supabase.from('remessas').update({ status: 'Suspeita', nota_devolucao: notaStr }).eq('id_remessa', Number(id));
    }

    return { ok: true, suspeitas: idsSuspeitas.length };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  } finally {
    syncEmAndamento = false;
  }
}

// ============================================================
// ENCERRAR DEMONSTRAÇÕES: para cada produto em demonstração (movimentacao_produtos
// status 'Pendente'), consulta MovimentoEstoque na Omie; se houve ENTRADA depois
// da data de saída, marca aquele registro como 'Devolvida' (com NF/data). É o que
// impede a lista de demonstração de acumular itens já devolvidos.
// Porta a "Parte 4" de syncMovimentacaoProdutos do app legado. PESADO (1 chamada
// Omie por produto único) — rodar via cron, não em request HTTP curta.
// ============================================================
export async function detectarDevolucoesDemonstracao(conta: Conta): Promise<{ ok: boolean; consultados?: number; devolvidos?: number; erros?: number; mensagem?: string }> {
  if (syncEmAndamento) return { ok: false, mensagem: 'Sync já em andamento' };
  syncEmAndamento = true;
  const low = contaLow(conta);
  try {
    const codsEntrada = ['RRE', 'NFC', 'RDE', 'AJE', 'RDV'];
    const hoje = formatDateBR(new Date());

    const { data: pendentes } = await supabase
      .from('movimentacao_produtos')
      .select('id,cod_produto,data_saida,id_remessa')
      .eq('conta_omie', low)
      .eq('status', 'Pendente');
    if (!pendentes || pendentes.length === 0) return { ok: true, consultados: 0, devolvidos: 0, erros: 0 };

    // Agrupa por cod_produto (evita consultas repetidas).
    const porProduto: Record<string, any[]> = {};
    for (const p of pendentes) {
      const k = String(p.cod_produto);
      (porProduto[k] = porProduto[k] || []).push(p);
    }
    const produtos = Object.keys(porProduto);

    let consultados = 0, devolvidos = 0, erros = 0;
    for (const codProd of produtos) {
      const regs = porProduto[codProd];
      let dataMin: Date | null = null;
      for (const r of regs) { const d = parseDateBR(r.data_saida); if (d && (!dataMin || d < dataMin)) dataMin = d; }
      if (!dataMin) { consultados++; continue; }

      try {
        const resp = await omieRequest<{ movProduto?: any[] }>(
          '/estoque/consulta/', 'MovimentoEstoque',
          { id_prod: Number(codProd), dataInicial: formatDateBR(dataMin), dataFinal: hoje },
          OMIE_OPTS(conta),
        );
        const movimentos = resp.movProduto || [];
        for (const reg of regs) {
          const dataRem = parseDateBR(reg.data_saida);
          if (!dataRem) continue;
          const entrada = movimentos.find((mov: any) => {
            const dt = parseDateBR(mov.dtMov);
            if (!dt || dt < dataRem) return false;
            const co = (mov.codOrigem || '').toUpperCase();
            const tp = (mov.tipo || '').toUpperCase();
            return codsEntrada.includes(co) || tp === 'E';
          });
          if (entrada) {
            await supabase.from('movimentacao_produtos').update({
              status: 'Devolvida',
              numero_nota_entrada: entrada.numDoc ? 'NF ' + entrada.numDoc : '',
              data_entrada: entrada.dtMov || '',
              atualizado_em: new Date().toISOString(),
            }).eq('id', reg.id);
            devolvidos++;
          }
        }
      } catch {
        erros++;
      }
      consultados++;
      if (consultados < produtos.length) await sleep(API_DELAY);
    }
    return { ok: true, consultados, devolvidos, erros };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  } finally {
    syncEmAndamento = false;
  }
}
