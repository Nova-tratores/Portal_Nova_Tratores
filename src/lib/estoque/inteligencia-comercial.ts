// Inteligência Comercial (módulo /estoque/inteligencia-comercial): 3 agregados
// server-side, todo o histórico (desde 11/2022), por conta (NOVA/CASTRO/Todas):
//   1) comprasPorProduto  — o que compramos, agregado por produto + fornecedores
//   2) clientesResumo      — por cliente: nº de vendas, produtos, valor, última venda
//   3) oportunidadesRFM    — RFM por produto + flag "está na hora de vender"
//
// GOTCHA de conta: `produtos.conta_omie` é MINÚSCULO ("nova"/"castro"); as demais
// (`vendas_itens`, `notas_entrada`) são MAIÚSCULAS. Por isso o filtro de `produtos`
// usa conta.toLowerCase() e NÃO o filtroConta padrão (ver giro.ts).

import { supabase, filtroConta } from './supabase';
import { type Conta, type ContaFiltro } from './conta';
import { carregarTipoCaracteristica } from './cruzamento-familia';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;
const LOTE = 1000;

/** "DD/MM/YYYY" -> Date (meia-noite local) ou null. */
function parseDataBR(s: unknown): Date | null {
  if (!s) return null;
  const p = String(s).split('/');
  if (p.length !== 3) return null;
  const d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
  return isNaN(d.getTime()) ? null : d;
}

const diasEntre = (a: Date, b: Date): number => Math.round((a.getTime() - b.getTime()) / 86_400_000);

const norm = (s: unknown): string => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Classificação Peças/Máquinas por família da venda (mesma regra do giro.ts):
// pecas = vazio ou contém 'peca'; maquinas = maquina/trator/implemento/agricul.
export type GrupoFamilia = 'pecas' | 'maquinas' | '';
function passaGrupo(familia: unknown, grupo: GrupoFamilia): boolean {
  if (!grupo) return true;
  const f = norm(familia);
  if (grupo === 'pecas') return f === '' || f.includes('peca');
  return f.includes('maquina') || f.includes('trator') || f.includes('implemento') || f.includes('agricul');
}

export interface ProdutoCadastro { sku: string; descricao: string; familia: string; estoque: number; cmc: number }

/** Mapa codigo_produto(interno) -> cadastro (SKU/descrição/família/estoque/cmc). */
async function carregarProdutosMap(conta: ContaFiltro): Promise<Map<string, ProdutoCadastro>> {
  const mapa = new Map<string, ProdutoCadastro>();
  const filtro = <T,>(q: T): T =>
    conta ? (q as { eq(c: string, v: string): T }).eq('conta_omie', conta.toLowerCase()) : q;
  let off = 0;
  for (;;) {
    const { data, error } = await filtro(
      supabase.from('produtos').select('codigo_produto,codigo,descricao,familia_nome,estoque,cmc'),
    ).range(off, off + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const p of lote) {
      mapa.set(String(p.codigo_produto), {
        sku: String(p.codigo ?? ''),
        descricao: String(p.descricao ?? ''),
        familia: String(p.familia_nome ?? ''),
        estoque: num(p.estoque) < 0 ? 0 : num(p.estoque),
        cmc: num(p.cmc),
      });
    }
    if (lote.length < LOTE) break;
    off += LOTE;
  }
  return mapa;
}

// ===================== Aba 1 — Compras (agregado por produto) =====================

// Parser de item CRU do Omie (det[]): igual ao parseItemExport de notas-entrada.ts.
function parseItemCompra(raw: unknown): { cod: string; sku: string; descricao: string; qtd: number; valor: number } {
  const it = (raw || {}) as Record<string, unknown>;
  const prod = (it.prod ?? null) as Record<string, unknown> | null;
  if (prod) {
    const nf = (it.nfProdInt ?? {}) as Record<string, unknown>;
    const nCod = nf.nCodProd != null ? String(nf.nCodProd) : '';
    return {
      cod: nCod && nCod !== '0' ? nCod : '',
      sku: String(prod.cProd ?? ''),
      descricao: String(prod.xProd ?? ''),
      qtd: num(prod.qCom ?? prod.qTrib),
      valor: num(prod.vProd ?? prod.vTotItem),
    };
  }
  return { cod: '', sku: String(it.codigo ?? ''), descricao: String(it.descricao ?? ''), qtd: num(it.quantidade), valor: num(it.valor_total) };
}

export interface CompraProdutoRow {
  chave: string;
  sku: string;
  descricao: string;
  vinculado: boolean;
  qtd_total: number;
  valor_total: number;
  n_fornecedores: number;
  fornecedores: string;
  n_notas: number;
  ultima_compra: string | null;
}

export async function comprasPorProduto(conta: ContaFiltro): Promise<{ itens: CompraProdutoRow[]; total: number }> {
  const produtos = await carregarProdutosMap(conta);
  interface Agg { cod: string; skuNf: string; descNf: string; qtd: number; valor: number; fornecedores: Set<string>; notas: Set<string>; ultima: Date | null; ultimaStr: string | null }
  const agg = new Map<string, Agg>();

  let off = 0;
  for (;;) {
    const { data, error } = await filtroConta(
      supabase.from('notas_entrada').select('id,numero_nf,data_emissao,nome_emitente,itens').order('id', { ascending: true }),
      conta,
    ).range(off, off + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const nota of lote) {
      const fornecedor = String(nota.nome_emitente ?? '').trim();
      const nf = String(nota.numero_nf ?? '');
      const dataStr = String(nota.data_emissao ?? '');
      const dt = parseDataBR(dataStr);
      const itens = Array.isArray(nota.itens) ? nota.itens : [];
      for (const raw of itens) {
        const item = parseItemCompra(raw);
        // Chave = produto interno; sem vínculo agrupa pelo código do fornecedor (SKU da NF).
        const chave = item.cod ? item.cod : (item.sku ? 'nf:' + item.sku : 'nf:?');
        let a = agg.get(chave);
        if (!a) { a = { cod: item.cod, skuNf: item.sku, descNf: item.descricao, qtd: 0, valor: 0, fornecedores: new Set(), notas: new Set(), ultima: null, ultimaStr: null }; agg.set(chave, a); }
        a.qtd += item.qtd;
        a.valor += item.valor;
        if (fornecedor) a.fornecedores.add(fornecedor);
        if (nf) a.notas.add(nf);
        if (item.descricao && !a.descNf) a.descNf = item.descricao;
        if (dt && (!a.ultima || dt > a.ultima)) { a.ultima = dt; a.ultimaStr = dataStr; }
      }
    }
    if (lote.length < LOTE) break;
    off += LOTE;
  }

  const itens: CompraProdutoRow[] = [];
  for (const [chave, a] of agg) {
    const cad = a.cod ? produtos.get(a.cod) : undefined;
    itens.push({
      chave,
      sku: cad?.sku || a.skuNf || '',
      descricao: cad?.descricao || a.descNf || '',
      vinculado: !!cad,
      qtd_total: a.qtd,
      valor_total: a.valor,
      n_fornecedores: a.fornecedores.size,
      fornecedores: [...a.fornecedores].sort().join(' | '),
      n_notas: a.notas.size,
      ultima_compra: a.ultimaStr,
    });
  }
  itens.sort((x, y) => y.valor_total - x.valor_total);
  return { itens, total: itens.length };
}

// ===================== Aba 2 — Clientes =====================

function empresaParaConta(e: unknown): string {
  const s = String(e ?? '').toUpperCase();
  if (s.includes('NOVA')) return 'NOVA';
  if (s.includes('CASTRO')) return 'CASTRO';
  return s;
}

// Resolve nome + telefone (best-effort) por 'CONTA|cod_cli', cascata
// portal_nt_clientes_cadastro_omie -> gv_clientes_omie_cache. Reusado pela aba
// Clientes e pelo histórico por cliente da aba RFM.
async function resolverNomesClientes(codsPorConta: Map<string, Set<number>>): Promise<Map<string, { nome: string; telefone: string }>> {
  const out = new Map<string, { nome: string; telefone: string }>();
  const todos = new Set<number>();
  codsPorConta.forEach((set) => set.forEach((c) => todos.add(c)));
  const arr = [...todos];
  if (arr.length === 0) return out;

  // Descobre se a coluna telefone existe (best-effort; degrada sem ela).
  let sel = 'cod_cli,empresa,razao_social,nome_fantasia,telefone';
  let colTel: 'telefone' | '' = 'telefone';
  const probe = await supabase.from('portal_nt_clientes_cadastro_omie').select(sel).limit(1);
  if (probe.error) { sel = 'cod_cli,empresa,razao_social,nome_fantasia'; colTel = ''; }

  const nome = new Map<string, string>();
  const tel = new Map<string, string>();
  const nomeCache = new Map<string, string>();
  for (let i = 0; i < arr.length; i += 300) {
    const slice = arr.slice(i, i + 300);
    const [cad, cache] = await Promise.all([
      supabase.from('portal_nt_clientes_cadastro_omie').select(sel).in('cod_cli', slice),
      supabase.from('gv_clientes_omie_cache').select('cod_cli,conta,nome').in('cod_cli', slice),
    ]);
    (cad.data as Array<Record<string, unknown>> | null)?.forEach((c) => {
      const chave = empresaParaConta(c.empresa) + '|' + c.cod_cli;
      const nm = String(c.razao_social || c.nome_fantasia || '').trim();
      if (nm) nome.set(chave, nm);
      if (colTel && c[colTel]) tel.set(chave, String(c[colTel]).trim());
    });
    if (!cache.error) (cache.data as Array<Record<string, unknown>> | null)?.forEach((c) => {
      if (c.nome) nomeCache.set(String(c.conta ?? '').toUpperCase() + '|' + c.cod_cli, String(c.nome));
    });
  }
  const chaves = new Set<string>([...nome.keys(), ...nomeCache.keys(), ...tel.keys()]);
  chaves.forEach((k) => out.set(k, { nome: nome.get(k) || nomeCache.get(k) || '', telefone: tel.get(k) || '' }));
  return out;
}

export interface ClienteRow {
  codigo_cliente: string;
  conta: string;
  nome: string;
  n_vendas: number;
  n_produtos: number;
  qtd_total: number;
  valor_total: number;
  ultima_venda: string | null;
  produtos_top: string;
}

export async function clientesResumo(conta: ContaFiltro, grupo: GrupoFamilia = ''): Promise<{ itens: ClienteRow[]; total: number }> {
  interface Agg { conta: string; codigo: string; pedidos: Set<string>; produtos: Map<string, { valor: number; desc: string }>; qtd: number; valor: number; ultima: Date | null; ultimaStr: string | null; nomeFallback: string }
  const agg = new Map<string, Agg>();
  const codsPorConta = new Map<string, Set<number>>(); // conta -> cod_cli numéricos

  let off = 0;
  for (;;) {
    const { data, error } = await filtroConta(
      supabase.from('vendas_itens').select('codigo_produto,valor_total,quantidade,data_pedido,numero_pedido,codigo_cliente,nome_cliente,descricao,familia,conta_omie').order('id', { ascending: true }),
      conta,
    ).range(off, off + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const v of lote) {
      if (!passaGrupo(v.familia, grupo)) continue;
      const cod = String(v.codigo_cliente ?? '').trim();
      if (!cod || !/^\d+$/.test(cod)) continue;
      const contaV = String(v.conta_omie ?? '').toUpperCase();
      const chave = contaV + '|' + cod;
      let a = agg.get(chave);
      if (!a) { a = { conta: contaV, codigo: cod, pedidos: new Set(), produtos: new Map(), qtd: 0, valor: 0, ultima: null, ultimaStr: null, nomeFallback: '' }; agg.set(chave, a); }
      const ped = String(v.numero_pedido ?? '').trim();
      if (ped) a.pedidos.add(ped);
      const valor = num(v.valor_total);
      a.qtd += num(v.quantidade);
      a.valor += valor;
      const codProd = String(v.codigo_produto ?? '');
      if (codProd) {
        const p = a.produtos.get(codProd);
        if (p) p.valor += valor; else a.produtos.set(codProd, { valor, desc: String(v.descricao ?? codProd) });
      }
      const dt = parseDataBR(v.data_pedido);
      if (dt && (!a.ultima || dt > a.ultima)) { a.ultima = dt; a.ultimaStr = String(v.data_pedido); }
      if (!a.nomeFallback && v.nome_cliente) a.nomeFallback = String(v.nome_cliente).trim();
      if (!codsPorConta.has(contaV)) codsPorConta.set(contaV, new Set());
      codsPorConta.get(contaV)!.add(Number(cod));
    }
    if (lote.length < LOTE) break;
    off += LOTE;
  }

  const nomes = await resolverNomesClientes(codsPorConta);

  const itens: ClienteRow[] = [];
  for (const a of agg.values()) {
    const chave = a.conta + '|' + a.codigo;
    const nome = nomes.get(chave)?.nome || a.nomeFallback || ('#' + a.codigo);
    const topProdutos = [...a.produtos.values()].sort((x, y) => y.valor - x.valor).slice(0, 8).map((p) => p.desc);
    itens.push({
      codigo_cliente: a.codigo,
      conta: a.conta,
      nome,
      n_vendas: a.pedidos.size,
      n_produtos: a.produtos.size,
      qtd_total: a.qtd,
      valor_total: a.valor,
      ultima_venda: a.ultimaStr,
      produtos_top: topProdutos.join(' | '),
    });
  }
  itens.sort((x, y) => y.valor_total - x.valor_total);
  return { itens, total: itens.length };
}

// ===================== Aba 3 — Oportunidades (RFM de produtos) =====================

export interface OportunidadeRow {
  codigo_produto: string;
  sku: string;
  descricao: string;
  familia: string;
  estoque: number;
  cmc: number;
  ultima_venda: string | null;
  dias_desde_ultima: number | null;
  intervalo_medio: number | null;
  n_vendas: number;
  qtd_vendida: number;
  faturamento: number;
  r_score: number;
  f_score: number;
  m_score: number;
  rfm: number;
  na_hora: boolean;
}

/** Score 1..5 por quintil (maior valor -> maior score). */
function quintilScores(valores: number[]): (v: number) => number {
  const ord = [...valores].filter((v) => v > 0).sort((a, b) => a - b);
  if (ord.length === 0) return () => 1;
  const q = (p: number) => ord[Math.min(ord.length - 1, Math.floor(p * ord.length))];
  const cortes = [q(0.2), q(0.4), q(0.6), q(0.8)];
  return (v: number) => {
    if (v <= 0) return 1;
    let s = 1;
    for (const c of cortes) { if (v > c) s++; }
    return s;
  };
}

export async function oportunidadesRFM(conta: ContaFiltro): Promise<{ itens: OportunidadeRow[]; total: number; na_hora: number }> {
  const produtos = await carregarProdutosMap(conta);
  interface Agg { pedidos: Set<string>; datas: Set<string>; qtd: number; faturamento: number; descricao: string; familia: string; ultima: Date | null; ultimaStr: string | null }
  const agg = new Map<string, Agg>();

  let off = 0;
  for (;;) {
    const { data, error } = await filtroConta(
      supabase.from('vendas_itens').select('codigo_produto,valor_total,quantidade,data_pedido,numero_pedido,descricao,familia').order('id', { ascending: true }),
      conta,
    ).range(off, off + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const v of lote) {
      const cod = String(v.codigo_produto ?? '').trim();
      if (!cod) continue;
      let a = agg.get(cod);
      if (!a) { a = { pedidos: new Set(), datas: new Set(), qtd: 0, faturamento: 0, descricao: '', familia: '', ultima: null, ultimaStr: null }; agg.set(cod, a); }
      const ped = String(v.numero_pedido ?? '').trim();
      if (ped) a.pedidos.add(ped);
      const ds = String(v.data_pedido ?? '').trim();
      if (ds) a.datas.add(ds);
      a.qtd += num(v.quantidade);
      a.faturamento += num(v.valor_total);
      if (v.descricao) a.descricao = String(v.descricao);
      if (v.familia) a.familia = String(v.familia);
      const dt = parseDataBR(ds);
      if (dt && (!a.ultima || dt > a.ultima)) { a.ultima = dt; a.ultimaStr = ds; }
    }
    if (lote.length < LOTE) break;
    off += LOTE;
  }

  const hoje = new Date();
  interface Tmp extends OportunidadeRow { _fatArr?: never }
  const base: Tmp[] = [];
  for (const [cod, a] of agg) {
    const cad = produtos.get(cod);
    const datasOrd = [...a.datas].map(parseDataBR).filter((d): d is Date => !!d).sort((x, y) => x.getTime() - y.getTime());
    const nVendas = a.pedidos.size || datasOrd.length;
    const diasDesde = a.ultima ? diasEntre(hoje, a.ultima) : null;
    let intervalo: number | null = null;
    if (datasOrd.length >= 2) intervalo = Math.round(diasEntre(datasOrd[datasOrd.length - 1], datasOrd[0]) / (datasOrd.length - 1));
    const estoque = cad?.estoque ?? 0;
    const naHora = estoque > 0 && nVendas >= 3 && intervalo != null && diasDesde != null && diasDesde >= intervalo * 0.8;
    base.push({
      codigo_produto: cod,
      sku: cad?.sku || cod,
      descricao: cad?.descricao || a.descricao || cod,
      familia: cad?.familia || a.familia || '',
      estoque,
      cmc: cad?.cmc ?? 0,
      ultima_venda: a.ultimaStr,
      dias_desde_ultima: diasDesde,
      intervalo_medio: intervalo,
      n_vendas: nVendas,
      qtd_vendida: a.qtd,
      faturamento: a.faturamento,
      r_score: 0, f_score: 0, m_score: 0, rfm: 0,
      na_hora: naHora,
    });
  }

  // Scores por quintil: R = recência (menos dias parado -> score maior),
  // F = nº de vendas, M = faturamento.
  const scoreF = quintilScores(base.map((b) => b.n_vendas));
  const scoreM = quintilScores(base.map((b) => b.faturamento));
  const maxDias = Math.max(1, ...base.map((b) => b.dias_desde_ultima ?? 0));
  const scoreR = quintilScores(base.map((b) => (b.dias_desde_ultima == null ? 0 : maxDias - b.dias_desde_ultima)));
  for (const b of base) {
    b.f_score = scoreF(b.n_vendas);
    b.m_score = scoreM(b.faturamento);
    b.r_score = scoreR(b.dias_desde_ultima == null ? 0 : maxDias - b.dias_desde_ultima);
    b.rfm = b.r_score + b.f_score + b.m_score;
  }
  // Default: "na hora" primeiro, depois RFM desc, depois faturamento desc.
  base.sort((x, y) => (Number(y.na_hora) - Number(x.na_hora)) || (y.rfm - x.rfm) || (y.faturamento - x.faturamento));
  return { itens: base, total: base.length, na_hora: base.filter((b) => b.na_hora).length };
}

// ===================== CRM de oportunidades (produto × cliente) =====================

export interface UltimoContato { resultado: string; motivo: string | null; observacao: string | null; autor_nome: string | null; data: string }

async function mapaMotivos(): Promise<Map<number, string>> {
  const m = new Map<number, string>();
  const { data } = await supabase.from('oportunidade_motivo').select('id,nome');
  (data as Array<{ id: number; nome: string }> | null)?.forEach((x) => m.set(x.id, x.nome));
  return m;
}

// Último contato por 'CONTA|cod_cli' para um produto. Se a tabela ainda não foi
// criada (migration pendente), devolve mapa vazio (sem quebrar a tela).
async function ultimosContatos(codigoProduto: string, conta: ContaFiltro): Promise<Map<string, UltimoContato>> {
  const map = new Map<string, UltimoContato>();
  let q = supabase.from('oportunidade_contatos')
    .select('codigo_cliente,conta_omie,resultado,motivo_id,observacao,autor_nome,created_at')
    .eq('codigo_produto', codigoProduto).order('created_at', { ascending: false });
  if (conta) q = q.eq('conta_omie', conta);
  const { data, error } = await q;
  if (error) return map;
  const motivos = await mapaMotivos();
  for (const c of (data || []) as Array<Record<string, unknown>>) {
    const chave = String(c.conta_omie ?? '').toUpperCase() + '|' + String(c.codigo_cliente ?? '');
    if (map.has(chave)) continue; // já é o mais recente (ordenado desc)
    map.set(chave, {
      resultado: String(c.resultado),
      motivo: c.motivo_id != null ? (motivos.get(Number(c.motivo_id)) || null) : null,
      observacao: c.observacao ? String(c.observacao) : null,
      autor_nome: c.autor_nome ? String(c.autor_nome) : null,
      data: String(c.created_at),
    });
  }
  return map;
}

export interface ClienteProdutoRow {
  codigo_cliente: string; conta: string; nome: string; telefone: string;
  n_compras: number; qtd: number; valor: number; ultima_compra: string | null;
  ultimo_contato: UltimoContato | null;
}

// Histórico: clientes que já compraram um produto (para o vendedor contatar).
export async function clientesPorProduto(codigoProduto: string, conta: ContaFiltro): Promise<{ produto: { codigo_produto: string; sku: string; descricao: string }; itens: ClienteProdutoRow[] }> {
  const produtos = await carregarProdutosMap(conta);
  const cad = produtos.get(codigoProduto);
  interface Agg { conta: string; codigo: string; pedidos: Set<string>; qtd: number; valor: number; ultima: Date | null; ultimaStr: string | null; nomeFallback: string }
  const agg = new Map<string, Agg>();
  const codsPorConta = new Map<string, Set<number>>();

  let off = 0;
  for (;;) {
    const { data, error } = await filtroConta(
      supabase.from('vendas_itens').select('codigo_cliente,nome_cliente,numero_pedido,quantidade,valor_total,data_pedido,conta_omie').eq('codigo_produto', codigoProduto).order('id', { ascending: true }),
      conta,
    ).range(off, off + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const v of lote) {
      const cod = String(v.codigo_cliente ?? '').trim();
      if (!cod || !/^\d+$/.test(cod)) continue;
      const contaV = String(v.conta_omie ?? '').toUpperCase();
      const chave = contaV + '|' + cod;
      let a = agg.get(chave);
      if (!a) { a = { conta: contaV, codigo: cod, pedidos: new Set(), qtd: 0, valor: 0, ultima: null, ultimaStr: null, nomeFallback: '' }; agg.set(chave, a); }
      const ped = String(v.numero_pedido ?? '').trim(); if (ped) a.pedidos.add(ped);
      a.qtd += num(v.quantidade); a.valor += num(v.valor_total);
      const dt = parseDataBR(v.data_pedido);
      if (dt && (!a.ultima || dt > a.ultima)) { a.ultima = dt; a.ultimaStr = String(v.data_pedido); }
      if (!a.nomeFallback && v.nome_cliente) a.nomeFallback = String(v.nome_cliente).trim();
      if (!codsPorConta.has(contaV)) codsPorConta.set(contaV, new Set());
      codsPorConta.get(contaV)!.add(Number(cod));
    }
    if (lote.length < LOTE) break;
    off += LOTE;
  }

  const nomes = await resolverNomesClientes(codsPorConta);
  const contatos = await ultimosContatos(codigoProduto, conta);
  const itens: ClienteProdutoRow[] = [];
  for (const a of agg.values()) {
    const chave = a.conta + '|' + a.codigo;
    const info = nomes.get(chave);
    itens.push({
      codigo_cliente: a.codigo, conta: a.conta,
      nome: info?.nome || a.nomeFallback || ('#' + a.codigo),
      telefone: info?.telefone || '',
      n_compras: a.pedidos.size, qtd: a.qtd, valor: a.valor, ultima_compra: a.ultimaStr,
      ultimo_contato: contatos.get(chave) || null,
    });
  }
  itens.sort((x, y) => y.valor - x.valor);
  return { produto: { codigo_produto: codigoProduto, sku: cad?.sku || codigoProduto, descricao: cad?.descricao || codigoProduto }, itens };
}

// Lista-de-ligação: produto × cliente para todos os produtos "na hora" (export CSV).
export interface OportExportRow { sku: string; descricao: string; estoque: number; conta: string; codigo_cliente: string; cliente: string; telefone: string; n_compras: number; qtd: number; valor: number; ultima_compra: string | null }

export async function exportarOportunidadesClientes(conta: ContaFiltro): Promise<{ itens: OportExportRow[]; total: number }> {
  const rfm = await oportunidadesRFM(conta);
  const naHora = new Map(rfm.itens.filter((i) => i.na_hora).map((i) => [i.codigo_produto, i]));
  if (naHora.size === 0) return { itens: [], total: 0 };

  interface Agg { conta: string; cod: string; produto: string; pedidos: Set<string>; qtd: number; valor: number; ultima: Date | null; ultimaStr: string | null; nomeFallback: string }
  const agg = new Map<string, Agg>();
  const codsPorConta = new Map<string, Set<number>>();
  let off = 0;
  for (;;) {
    const { data, error } = await filtroConta(
      supabase.from('vendas_itens').select('codigo_produto,codigo_cliente,nome_cliente,numero_pedido,quantidade,valor_total,data_pedido,conta_omie').order('id', { ascending: true }),
      conta,
    ).range(off, off + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const v of lote) {
      const prod = String(v.codigo_produto ?? '').trim();
      if (!naHora.has(prod)) continue;
      const cod = String(v.codigo_cliente ?? '').trim();
      if (!cod || !/^\d+$/.test(cod)) continue;
      const contaV = String(v.conta_omie ?? '').toUpperCase();
      const chave = prod + '|' + contaV + '|' + cod;
      let a = agg.get(chave);
      if (!a) { a = { conta: contaV, cod, produto: prod, pedidos: new Set(), qtd: 0, valor: 0, ultima: null, ultimaStr: null, nomeFallback: '' }; agg.set(chave, a); }
      const ped = String(v.numero_pedido ?? '').trim(); if (ped) a.pedidos.add(ped);
      a.qtd += num(v.quantidade); a.valor += num(v.valor_total);
      const dt = parseDataBR(v.data_pedido);
      if (dt && (!a.ultima || dt > a.ultima)) { a.ultima = dt; a.ultimaStr = String(v.data_pedido); }
      if (!a.nomeFallback && v.nome_cliente) a.nomeFallback = String(v.nome_cliente).trim();
      if (!codsPorConta.has(contaV)) codsPorConta.set(contaV, new Set());
      codsPorConta.get(contaV)!.add(Number(cod));
    }
    if (lote.length < LOTE) break;
    off += LOTE;
  }

  const nomes = await resolverNomesClientes(codsPorConta);
  const itens: OportExportRow[] = [];
  for (const a of agg.values()) {
    const info = nomes.get(a.conta + '|' + a.cod);
    const p = naHora.get(a.produto)!;
    itens.push({
      sku: p.sku, descricao: p.descricao, estoque: p.estoque, conta: a.conta,
      codigo_cliente: a.cod, cliente: info?.nome || a.nomeFallback || ('#' + a.cod), telefone: info?.telefone || '',
      n_compras: a.pedidos.size, qtd: a.qtd, valor: a.valor, ultima_compra: a.ultimaStr,
    });
  }
  itens.sort((x, y) => x.sku.localeCompare(y.sku) || (y.valor - x.valor));
  return { itens, total: itens.length };
}

export interface Motivo { id: number; nome: string }
export async function listarMotivos(): Promise<Motivo[]> {
  const { data, error } = await supabase.from('oportunidade_motivo').select('id,nome').eq('ativo', true).order('id');
  if (error) return [];
  return (data || []) as Motivo[];
}

export interface ContatoInput {
  codigo_produto: string; sku?: string | null; descricao_produto?: string | null;
  codigo_cliente: string; conta_omie?: string | null; cliente_nome?: string | null;
  resultado: 'vendeu' | 'nao_vendeu' | 'sem_resposta'; motivo_id?: number | null;
  observacao?: string | null; autor_id?: string | null; autor_nome?: string | null;
}

export async function registrarContato(p: ContatoInput): Promise<{ ok: true; id: number }> {
  if (!p.codigo_produto || !p.codigo_cliente) throw new Error('produto e cliente são obrigatórios');
  if (!['vendeu', 'nao_vendeu', 'sem_resposta'].includes(p.resultado)) throw new Error('resultado inválido');
  if (p.resultado === 'nao_vendeu' && !p.motivo_id) throw new Error('Motivo é obrigatório quando não vendeu');
  const row = {
    codigo_produto: String(p.codigo_produto), sku: p.sku || null, descricao_produto: p.descricao_produto || null,
    codigo_cliente: String(p.codigo_cliente), conta_omie: String(p.conta_omie || '').toUpperCase(),
    cliente_nome: p.cliente_nome || null, resultado: p.resultado,
    motivo_id: p.resultado === 'nao_vendeu' ? (p.motivo_id ?? null) : null,
    observacao: p.observacao || null, autor_id: p.autor_id || null, autor_nome: p.autor_nome || null,
  };
  const { data, error } = await supabase.from('oportunidade_contatos').insert(row).select('id').single();
  if (error) throw new Error(error.message);
  return { ok: true, id: (data as { id: number }).id };
}

// ===================== Aba 4 — Sugestões (sazonal por cliente) =====================
// Detecta, por cliente × grupo de peça, a ÉPOCA DO ANO em que ele costuma comprar
// (ex.: "Fulano compra discos em set/out todo ano") e alerta quando a época chega.
// Grupo = característica "Tipo" (produto_tipo.tipo, ex.: "Discos"); peça sem Tipo
// cai no próprio SKU. Só peças. Reusa parseDataBR/diasEntre/resolverNomesClientes.

// --- Parâmetros do motor (ajustar aqui se o resultado ficar ruidoso) ---
const SAZ_MIN_ANOS = 2;          // precisa comprar em ≥ 2 anos distintos p/ virar padrão
const SAZ_MIN_CONCENTRACAO = 0.5; // ≥ 50% das compras dentro da janela de pico (3 meses)
const SAZ_LEAD_DIAS = 45;         // antecedência: "chegando" começa 45 dias antes da janela
const SAZ_JA_COMPROU_DIAS = 100;  // se comprou na janela há ≤ 100 dias, marca "já comprou"

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_PT_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
// Dia-do-ano acumulado do 1º dia de cada mês (ano não bissexto; aproximação p/ ciclo).
const CUM_DIAS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const mod12 = (m: number): number => ((m % 12) + 12) % 12; // 0..11 a partir de índice 0-based

// Análise sazonal de UM grupo (cliente×tipo): recebe as compras distintas (mês/ano)
// e a data da última compra; devolve pico/janela/concentração/status + flag `sazonal`
// (≥2 anos e ≥50% concentrado). Usado tanto pela aba Sugestões quanto pela visão por
// cliente. `null` se não há nenhuma compra.
export interface AnaliseSazonal {
  sazonal: boolean;
  anos: number;
  pico_mes: number;      // 1..12
  janela: number[];      // 3 meses (1..12), em ordem [pico-1, pico, pico+1]
  concentracao: number;  // 0..1
  mes_tipico: string;
  janela_label: string;
  status: 'na_epoca' | 'chegando' | 'fora';
  dias_para_epoca: number | null;
  ja_comprou_ciclo: boolean;
}

function analisarGrupoSazonal(pedidos: Array<{ mes: number; ano: number }>, ultima: Date | null, agora: Date, mesHoje: number, diaHoje: number, lead: number): AnaliseSazonal | null {
  if (pedidos.length === 0) return null;
  const anos = new Set(pedidos.map((p) => p.ano)).size;
  const hist = new Array(12).fill(0) as number[];
  for (const p of pedidos) hist[p.mes - 1]++;
  const total = pedidos.length;
  let picoIdx = 0, melhor = -1;
  for (let c = 0; c < 12; c++) {
    const soma = hist[mod12(c - 1)] + hist[c] + hist[mod12(c + 1)];
    if (soma > melhor) { melhor = soma; picoIdx = c; }
  }
  const concentracao = total > 0 ? melhor / total : 0;
  const janela = [mod12(picoIdx - 1) + 1, picoIdx + 1, mod12(picoIdx + 1) + 1];
  const janelaSet = new Set(janela);
  const hojeDoy = CUM_DIAS[mesHoje - 1] + (diaHoje - 1);
  const inicioDoy = CUM_DIAS[janela[0] - 1]; // 1º dia do 1º mês da janela
  let diasAteInicio = inicioDoy - hojeDoy; if (diasAteInicio < 0) diasAteInicio += 365;
  const naEpoca = janelaSet.has(mesHoje);
  let status: AnaliseSazonal['status'];
  let diasParaEpoca: number | null;
  if (naEpoca) { status = 'na_epoca'; diasParaEpoca = 0; }
  else if (diasAteInicio <= lead) { status = 'chegando'; diasParaEpoca = diasAteInicio; }
  else { status = 'fora'; diasParaEpoca = diasAteInicio; }
  const mesUltima = ultima ? ultima.getMonth() + 1 : null;
  const diasDesde = ultima ? diasEntre(agora, ultima) : null;
  const jaComprou = !!(mesUltima && janelaSet.has(mesUltima) && diasDesde != null && diasDesde <= SAZ_JA_COMPROU_DIAS);
  const sazonal = pedidos.length >= SAZ_MIN_ANOS && anos >= SAZ_MIN_ANOS && concentracao >= SAZ_MIN_CONCENTRACAO;
  return {
    sazonal, anos, pico_mes: picoIdx + 1, janela, concentracao,
    mes_tipico: MESES_PT_LONGO[picoIdx], janela_label: janela.map((m) => MESES_PT[m - 1]).join('–'),
    status, dias_para_epoca: diasParaEpoca, ja_comprou_ciclo: jaComprou,
  };
}

// Último contato do CRM (mais recente por `codigo_produto|CONTA|codigo_cliente`) para
// um conjunto de peças representativas. Degrada p/ mapa vazio se a tabela não existir.
async function carregarUltimosContatos(repCods: string[]): Promise<Map<string, UltimoContato>> {
  const map = new Map<string, UltimoContato>();
  const cods = [...new Set(repCods.filter(Boolean))];
  if (cods.length === 0) return map;
  const motivos = await mapaMotivos();
  for (let i = 0; i < cods.length; i += 300) {
    const slice = cods.slice(i, i + 300);
    const { data, error } = await supabase.from('oportunidade_contatos')
      .select('codigo_produto,codigo_cliente,conta_omie,resultado,motivo_id,observacao,autor_nome,created_at')
      .in('codigo_produto', slice).order('created_at', { ascending: false });
    if (error) break;
    for (const c of (data || []) as Array<Record<string, unknown>>) {
      const chave = String(c.codigo_produto ?? '') + '|' + String(c.conta_omie ?? '').toUpperCase() + '|' + String(c.codigo_cliente ?? '');
      if (map.has(chave)) continue; // já é o mais recente (ordenado desc)
      map.set(chave, {
        resultado: String(c.resultado),
        motivo: c.motivo_id != null ? (motivos.get(Number(c.motivo_id)) || null) : null,
        observacao: c.observacao ? String(c.observacao) : null,
        autor_nome: c.autor_nome ? String(c.autor_nome) : null,
        data: String(c.created_at),
      });
    }
  }
  return map;
}

export interface SugestaoSkuRow { codigo_produto: string; sku: string; descricao: string; n_compras: number; qtd: number; valor: number; ultima_compra: string | null }

export interface SugestaoSazonalRow {
  conta: string;
  codigo_cliente: string;
  cliente: string;
  telefone: string;
  grupo: string;              // rótulo: "Discos" (Tipo) ou descrição/SKU no fallback
  is_tipo: boolean;           // true = agrupado por característica Tipo; false = SKU avulso
  mes_tipico: string;         // "Outubro"
  janela_label: string;       // "set–out–nov"
  concentracao: number;       // 0..1
  anos_recorrencia: number;
  n_compras: number;
  qtd_total: number;
  valor_total: number;
  ultima_compra: string | null;
  status: 'na_epoca' | 'chegando' | 'fora';
  dias_para_epoca: number | null; // dias até o início da janela (0 se na época)
  ja_comprou_ciclo: boolean;
  representante_codigo_produto: string;
  representante_sku: string;
  representante_descricao: string;
  ultimo_contato: UltimoContato | null;
  skus: SugestaoSkuRow[];     // peças específicas daquele grupo que o cliente compra (p/ o expand)
}

export async function sugestoesSazonais(conta: ContaFiltro, opts?: { mes?: number; dia?: number; lead?: number }): Promise<{ itens: SugestaoSazonalRow[]; total: number; sugeridas: number }> {
  const produtos = await carregarProdutosMap(conta);
  const tipoMap = await carregarTipoCaracteristica(conta); // codigo_produto -> "Tipo"

  interface PedidoInfo { mes: number; ano: number }
  interface SkuAgg { valor: number; qtd: number; desc: string; pedidos: Set<string>; ultima: Date | null; ultimaStr: string | null }
  interface Agg {
    conta: string; codigo: string; grupoKey: string; isTipo: boolean; rotulo: string;
    pedidoMes: Map<string, PedidoInfo>;          // numero_pedido -> mês/ano (compras distintas)
    valor: number; qtd: number;
    ultima: Date | null; ultimaStr: string | null;
    skus: Map<string, SkuAgg>;                    // codigo_produto -> agregado
    nomeFallback: string;
  }
  const agg = new Map<string, Agg>();
  const codsPorConta = new Map<string, Set<number>>();

  let off = 0;
  for (;;) {
    const { data, error } = await filtroConta(
      supabase.from('vendas_itens').select('codigo_produto,codigo_cliente,nome_cliente,numero_pedido,quantidade,valor_total,data_pedido,familia,descricao,conta_omie').order('id', { ascending: true }),
      conta,
    ).range(off, off + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const v of lote) {
      if (!passaGrupo(v.familia, 'pecas')) continue; // só peças
      const cod = String(v.codigo_cliente ?? '').trim();
      if (!cod || !/^\d+$/.test(cod)) continue;
      const codProd = String(v.codigo_produto ?? '').trim();
      if (!codProd) continue;
      const dt = parseDataBR(v.data_pedido);
      if (!dt) continue; // sem data não dá para inferir época
      const contaV = String(v.conta_omie ?? '').toUpperCase();
      const cad = produtos.get(codProd);
      const tipo = (tipoMap[codProd] || '').trim();
      const sku = cad?.sku || codProd;
      const grupoKey = tipo ? 'tipo:' + norm(tipo) : 'sku:' + sku;
      const chave = contaV + '|' + cod + '|' + grupoKey;
      let a = agg.get(chave);
      if (!a) {
        a = { conta: contaV, codigo: cod, grupoKey, isTipo: !!tipo, rotulo: tipo || (cad?.descricao || sku), pedidoMes: new Map(), valor: 0, qtd: 0, ultima: null, ultimaStr: null, skus: new Map(), nomeFallback: '' };
        agg.set(chave, a);
      }
      const ped = String(v.numero_pedido ?? '').trim();
      if (ped && !a.pedidoMes.has(ped)) a.pedidoMes.set(ped, { mes: dt.getMonth() + 1, ano: dt.getFullYear() });
      const valor = num(v.valor_total), qtd = num(v.quantidade);
      a.valor += valor; a.qtd += qtd;
      if (!a.ultima || dt > a.ultima) { a.ultima = dt; a.ultimaStr = String(v.data_pedido); }
      let s = a.skus.get(codProd);
      if (!s) { s = { valor: 0, qtd: 0, desc: cad?.descricao || String(v.descricao ?? '') || codProd, pedidos: new Set(), ultima: null, ultimaStr: null }; a.skus.set(codProd, s); }
      s.valor += valor; s.qtd += qtd; if (ped) s.pedidos.add(ped);
      if (!s.ultima || dt > s.ultima) { s.ultima = dt; s.ultimaStr = String(v.data_pedido); }
      if (!a.nomeFallback && v.nome_cliente) a.nomeFallback = String(v.nome_cliente).trim();
      if (!codsPorConta.has(contaV)) codsPorConta.set(contaV, new Set());
      codsPorConta.get(contaV)!.add(Number(cod));
    }
    if (lote.length < LOTE) break;
    off += LOTE;
  }

  // "Hoje" (ou mês/dia simulado via opts) para calcular a proximidade da época.
  const agora = new Date();
  const mesHoje = opts?.mes && opts.mes >= 1 && opts.mes <= 12 ? opts.mes : agora.getMonth() + 1;
  const diaHoje = opts?.dia && opts.dia >= 1 && opts.dia <= 31 ? opts.dia : agora.getDate();
  const lead = opts?.lead && opts.lead > 0 ? opts.lead : SAZ_LEAD_DIAS;

  // Só grupos com padrão sazonal viram linha da aba.
  interface Pre { a: Agg; an: AnaliseSazonal; rep: string; repSku: string; repDesc: string }
  const pres: Pre[] = [];
  for (const a of agg.values()) {
    const an = analisarGrupoSazonal([...a.pedidoMes.values()], a.ultima, agora, mesHoje, diaHoje, lead);
    if (!an || !an.sazonal) continue;
    // Representante = SKU de maior valor dentro do grupo (usado no CRM).
    let rep = '', repSku = '', repDesc = '', repVal = -1;
    for (const [codP, s] of a.skus) if (s.valor > repVal) { repVal = s.valor; rep = codP; repSku = (produtos.get(codP)?.sku) || codP; repDesc = s.desc; }
    pres.push({ a, an, rep, repSku, repDesc });
  }

  const contatoPorChave = await carregarUltimosContatos(pres.map((p) => p.rep));
  const nomes = await resolverNomesClientes(codsPorConta);

  const itens: SugestaoSazonalRow[] = pres.map((p) => {
    const a = p.a;
    const info = nomes.get(a.conta + '|' + a.codigo);
    const skus: SugestaoSkuRow[] = [...a.skus.entries()]
      .map(([codP, s]) => ({ codigo_produto: codP, sku: (produtos.get(codP)?.sku) || codP, descricao: s.desc, n_compras: s.pedidos.size, qtd: s.qtd, valor: s.valor, ultima_compra: s.ultimaStr }))
      .sort((x, y) => y.valor - x.valor);
    return {
      conta: a.conta,
      codigo_cliente: a.codigo,
      cliente: info?.nome || a.nomeFallback || ('#' + a.codigo),
      telefone: info?.telefone || '',
      grupo: a.rotulo,
      is_tipo: a.isTipo,
      mes_tipico: p.an.mes_tipico,
      janela_label: p.an.janela_label,
      concentracao: p.an.concentracao,
      anos_recorrencia: p.an.anos,
      n_compras: a.pedidoMes.size,
      qtd_total: a.qtd,
      valor_total: a.valor,
      ultima_compra: a.ultimaStr,
      status: p.an.status,
      dias_para_epoca: p.an.dias_para_epoca,
      ja_comprou_ciclo: p.an.ja_comprou_ciclo,
      representante_codigo_produto: p.rep,
      representante_sku: p.repSku,
      representante_descricao: p.repDesc,
      ultimo_contato: contatoPorChave.get(p.rep + '|' + a.conta + '|' + a.codigo) || null,
      skus,
    };
  });

  // Default: na época / chegando primeiro; já comprou desce; depois concentração, anos, valor.
  const ordemStatus: Record<SugestaoSazonalRow['status'], number> = { na_epoca: 0, chegando: 1, fora: 2 };
  itens.sort((x, y) =>
    (ordemStatus[x.status] - ordemStatus[y.status]) ||
    (Number(x.ja_comprou_ciclo) - Number(y.ja_comprou_ciclo)) ||
    (y.concentracao - x.concentracao) ||
    (y.anos_recorrencia - x.anos_recorrencia) ||
    (y.valor_total - x.valor_total),
  );
  const sugeridas = itens.filter((i) => i.status !== 'fora' && !i.ja_comprou_ciclo).length;
  return { itens, total: itens.length, sugeridas };
}

// ===== Sugestões sazonais de UM cliente (para o expand da aba Clientes) =====
// Mesma matemática, mas o scan de vendas é filtrado por codigo_cliente (barato).
// Devolve TODOS os grupos de peça que o cliente compra: os sazonais (com época)
// no topo e o resto ("outros tipos") marcado com sazonal=false.
export interface GrupoClienteRow {
  grupo: string;
  is_tipo: boolean;
  sazonal: boolean;
  mes_tipico: string | null;
  janela_label: string | null;
  concentracao: number;
  anos_recorrencia: number;
  n_compras: number;
  qtd_total: number;
  valor_total: number;
  ultima_compra: string | null;
  status: 'na_epoca' | 'chegando' | 'fora';
  dias_para_epoca: number | null;
  ja_comprou_ciclo: boolean;
  representante_codigo_produto: string;
  representante_sku: string;
  representante_descricao: string;
  ultimo_contato: UltimoContato | null;
  skus: SugestaoSkuRow[];
}

export async function sugestoesSazonaisCliente(conta: ContaFiltro, codigoCliente: string, opts?: { mes?: number; lead?: number }): Promise<{ cliente: string; conta: string; itens: GrupoClienteRow[]; sazonais: number }> {
  const cod = String(codigoCliente || '').trim();
  if (!cod || !/^\d+$/.test(cod)) throw new Error('cliente inválido');
  const produtos = await carregarProdutosMap(conta);
  const tipoMap = await carregarTipoCaracteristica(conta);

  interface PedidoInfo { mes: number; ano: number }
  interface SkuAgg { valor: number; qtd: number; desc: string; pedidos: Set<string>; ultima: Date | null; ultimaStr: string | null }
  interface Agg { conta: string; grupoKey: string; isTipo: boolean; rotulo: string; pedidoMes: Map<string, PedidoInfo>; valor: number; qtd: number; ultima: Date | null; ultimaStr: string | null; skus: Map<string, SkuAgg> }
  const agg = new Map<string, Agg>();
  let contaCli = '';
  let nomeFallback = '';

  let off = 0;
  for (;;) {
    const { data, error } = await filtroConta(
      supabase.from('vendas_itens').select('codigo_produto,codigo_cliente,nome_cliente,numero_pedido,quantidade,valor_total,data_pedido,familia,descricao,conta_omie').eq('codigo_cliente', cod).order('id', { ascending: true }),
      conta,
    ).range(off, off + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const v of lote) {
      if (!passaGrupo(v.familia, 'pecas')) continue; // só peças
      const codProd = String(v.codigo_produto ?? '').trim();
      if (!codProd) continue;
      const dt = parseDataBR(v.data_pedido);
      if (!dt) continue;
      contaCli = String(v.conta_omie ?? '').toUpperCase();
      if (!nomeFallback && v.nome_cliente) nomeFallback = String(v.nome_cliente).trim();
      const cad = produtos.get(codProd);
      const tipo = (tipoMap[codProd] || '').trim();
      const sku = cad?.sku || codProd;
      const grupoKey = tipo ? 'tipo:' + norm(tipo) : 'sku:' + sku;
      let a = agg.get(grupoKey);
      if (!a) { a = { conta: contaCli, grupoKey, isTipo: !!tipo, rotulo: tipo || (cad?.descricao || sku), pedidoMes: new Map(), valor: 0, qtd: 0, ultima: null, ultimaStr: null, skus: new Map() }; agg.set(grupoKey, a); }
      const ped = String(v.numero_pedido ?? '').trim();
      if (ped && !a.pedidoMes.has(ped)) a.pedidoMes.set(ped, { mes: dt.getMonth() + 1, ano: dt.getFullYear() });
      const valor = num(v.valor_total), qtd = num(v.quantidade);
      a.valor += valor; a.qtd += qtd;
      if (!a.ultima || dt > a.ultima) { a.ultima = dt; a.ultimaStr = String(v.data_pedido); }
      let s = a.skus.get(codProd);
      if (!s) { s = { valor: 0, qtd: 0, desc: cad?.descricao || String(v.descricao ?? '') || codProd, pedidos: new Set(), ultima: null, ultimaStr: null }; a.skus.set(codProd, s); }
      s.valor += valor; s.qtd += qtd; if (ped) s.pedidos.add(ped);
      if (!s.ultima || dt > s.ultima) { s.ultima = dt; s.ultimaStr = String(v.data_pedido); }
    }
    if (lote.length < LOTE) break;
    off += LOTE;
  }

  const agora = new Date();
  const mesHoje = opts?.mes && opts.mes >= 1 && opts.mes <= 12 ? opts.mes : agora.getMonth() + 1;
  const lead = opts?.lead && opts.lead > 0 ? opts.lead : SAZ_LEAD_DIAS;

  interface Pre { a: Agg; an: AnaliseSazonal; rep: string; repSku: string; repDesc: string }
  const pres: Pre[] = [];
  for (const a of agg.values()) {
    const an = analisarGrupoSazonal([...a.pedidoMes.values()], a.ultima, agora, mesHoje, agora.getDate(), lead);
    if (!an) continue;
    let rep = '', repSku = '', repDesc = '', repVal = -1;
    for (const [codP, s] of a.skus) if (s.valor > repVal) { repVal = s.valor; rep = codP; repSku = (produtos.get(codP)?.sku) || codP; repDesc = s.desc; }
    pres.push({ a, an, rep, repSku, repDesc });
  }

  const contatoPorChave = await carregarUltimosContatos(pres.map((p) => p.rep));

  const itens: GrupoClienteRow[] = pres.map((p) => {
    const a = p.a;
    const skus: SugestaoSkuRow[] = [...a.skus.entries()]
      .map(([codP, s]) => ({ codigo_produto: codP, sku: (produtos.get(codP)?.sku) || codP, descricao: s.desc, n_compras: s.pedidos.size, qtd: s.qtd, valor: s.valor, ultima_compra: s.ultimaStr }))
      .sort((x, y) => y.valor - x.valor);
    return {
      grupo: a.rotulo,
      is_tipo: a.isTipo,
      sazonal: p.an.sazonal,
      mes_tipico: p.an.sazonal ? p.an.mes_tipico : null,
      janela_label: p.an.sazonal ? p.an.janela_label : null,
      concentracao: p.an.concentracao,
      anos_recorrencia: p.an.anos,
      n_compras: a.pedidoMes.size,
      qtd_total: a.qtd,
      valor_total: a.valor,
      ultima_compra: a.ultimaStr,
      status: p.an.status,
      dias_para_epoca: p.an.dias_para_epoca,
      ja_comprou_ciclo: p.an.ja_comprou_ciclo,
      representante_codigo_produto: p.rep,
      representante_sku: p.repSku,
      representante_descricao: p.repDesc,
      ultimo_contato: contatoPorChave.get(p.rep + '|' + a.conta + '|' + cod) || null,
      skus,
    };
  });

  // Sazonais na época/chegando primeiro; depois demais sazonais; depois não-sazonais por valor.
  const ordemStatus: Record<GrupoClienteRow['status'], number> = { na_epoca: 0, chegando: 1, fora: 2 };
  itens.sort((x, y) =>
    (Number(y.sazonal) - Number(x.sazonal)) ||
    (ordemStatus[x.status] - ordemStatus[y.status]) ||
    (Number(x.ja_comprou_ciclo) - Number(y.ja_comprou_ciclo)) ||
    (y.valor_total - x.valor_total),
  );
  return { cliente: nomeFallback || ('#' + cod), conta: contaCli, itens, sazonais: itens.filter((i) => i.sazonal).length };
}

// ===================== Aba 5 — Sugestões POR PRODUTO (por Tipo de peça) =====================
// Espelho da visão por cliente: cada linha é um GRUPO de peça (Tipo, ex.: "Discos";
// sem Tipo cai no SKU), com a época em que ELE vende (agregada entre todos os clientes)
// + quantos clientes estão na época agora (padrão sazonal pessoal). O expand lista os
// clientes que compram aquele grupo (via clientesPorGrupo) para ligar/registrar contato.

export interface SugestaoProdutoRow {
  grupo: string;
  is_tipo: boolean;
  tipo_param: string;              // p/ o expand: Tipo (se is_tipo) ou codigo_produto (fallback SKU)
  sazonal: boolean;                // o PRODUTO tem época detectável
  mes_tipico: string | null;
  janela_label: string | null;
  concentracao: number;
  status: 'na_epoca' | 'chegando' | 'fora';
  dias_para_epoca: number | null;
  n_clientes: number;              // clientes distintos que compram o grupo
  n_clientes_epoca: number;        // clientes com padrão sazonal pessoal na época/chegando (não já comprou)
  n_vendas: number;                // pedidos distintos (todos os clientes)
  qtd_total: number;
  valor_total: number;
  ultima_venda: string | null;
}

export async function sugestoesPorProduto(conta: ContaFiltro, opts?: { mes?: number; lead?: number }): Promise<{ itens: SugestaoProdutoRow[]; total: number; sugeridas: number }> {
  const produtos = await carregarProdutosMap(conta);
  const tipoMap = await carregarTipoCaracteristica(conta);

  interface CliAgg { pedidoMes: Map<string, { mes: number; ano: number }>; ultima: Date | null }
  interface GrpAgg { isTipo: boolean; rotulo: string; repProd: string; pedidosGlobal: Map<string, { mes: number; ano: number }>; valor: number; qtd: number; ultima: Date | null; ultimaStr: string | null; clientes: Map<string, CliAgg> }
  const agg = new Map<string, GrpAgg>();

  let off = 0;
  for (;;) {
    const { data, error } = await filtroConta(
      supabase.from('vendas_itens').select('codigo_produto,codigo_cliente,numero_pedido,quantidade,valor_total,data_pedido,familia,conta_omie').order('id', { ascending: true }),
      conta,
    ).range(off, off + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const v of lote) {
      if (!passaGrupo(v.familia, 'pecas')) continue;
      const cod = String(v.codigo_cliente ?? '').trim();
      if (!cod || !/^\d+$/.test(cod)) continue;
      const codProd = String(v.codigo_produto ?? '').trim();
      if (!codProd) continue;
      const dt = parseDataBR(v.data_pedido);
      if (!dt) continue;
      const contaV = String(v.conta_omie ?? '').toUpperCase();
      const cad = produtos.get(codProd);
      const tipo = (tipoMap[codProd] || '').trim();
      const sku = cad?.sku || codProd;
      const grupoKey = tipo ? 'tipo:' + norm(tipo) : 'sku:' + sku;
      let g = agg.get(grupoKey);
      if (!g) { g = { isTipo: !!tipo, rotulo: tipo || (cad?.descricao || sku), repProd: codProd, pedidosGlobal: new Map(), valor: 0, qtd: 0, ultima: null, ultimaStr: null, clientes: new Map() }; agg.set(grupoKey, g); }
      const ped = String(v.numero_pedido ?? '').trim();
      const mesAno = { mes: dt.getMonth() + 1, ano: dt.getFullYear() };
      if (ped && !g.pedidosGlobal.has(ped)) g.pedidosGlobal.set(ped, mesAno);
      g.valor += num(v.valor_total); g.qtd += num(v.quantidade);
      if (!g.ultima || dt > g.ultima) { g.ultima = dt; g.ultimaStr = String(v.data_pedido); }
      const chaveCli = contaV + '|' + cod;
      let c = g.clientes.get(chaveCli);
      if (!c) { c = { pedidoMes: new Map(), ultima: null }; g.clientes.set(chaveCli, c); }
      if (ped && !c.pedidoMes.has(ped)) c.pedidoMes.set(ped, mesAno);
      if (!c.ultima || dt > c.ultima) c.ultima = dt;
    }
    if (lote.length < LOTE) break;
    off += LOTE;
  }

  const agora = new Date();
  const mesHoje = opts?.mes && opts.mes >= 1 && opts.mes <= 12 ? opts.mes : agora.getMonth() + 1;
  const diaHoje = agora.getDate();
  const lead = opts?.lead && opts.lead > 0 ? opts.lead : SAZ_LEAD_DIAS;

  const itens: SugestaoProdutoRow[] = [];
  for (const g of agg.values()) {
    const prodAn = analisarGrupoSazonal([...g.pedidosGlobal.values()], g.ultima, agora, mesHoje, diaHoje, lead);
    if (!prodAn) continue;
    let nEpoca = 0;
    for (const c of g.clientes.values()) {
      const an = analisarGrupoSazonal([...c.pedidoMes.values()], c.ultima, agora, mesHoje, diaHoje, lead);
      if (an && an.sazonal && (an.status === 'na_epoca' || an.status === 'chegando') && !an.ja_comprou_ciclo) nEpoca++;
    }
    itens.push({
      grupo: g.rotulo,
      is_tipo: g.isTipo,
      tipo_param: g.isTipo ? g.rotulo : g.repProd,
      sazonal: prodAn.sazonal,
      mes_tipico: prodAn.sazonal ? prodAn.mes_tipico : null,
      janela_label: prodAn.sazonal ? prodAn.janela_label : null,
      concentracao: prodAn.concentracao,
      status: prodAn.status,
      dias_para_epoca: prodAn.dias_para_epoca,
      n_clientes: g.clientes.size,
      n_clientes_epoca: nEpoca,
      n_vendas: g.pedidosGlobal.size,
      qtd_total: g.qtd,
      valor_total: g.valor,
      ultima_venda: g.ultimaStr,
    });
  }

  // Mais clientes na época primeiro (sinal acionável); depois produto sazonal/status; depois valor.
  // (Tipos amplos como "Filtros" vendem o ano todo no agregado, mas têm muitos clientes
  //  com padrão pessoal na época — é isso que interessa priorizar.)
  const ordemStatus: Record<SugestaoProdutoRow['status'], number> = { na_epoca: 0, chegando: 1, fora: 2 };
  itens.sort((x, y) =>
    (y.n_clientes_epoca - x.n_clientes_epoca) ||
    (Number(y.sazonal) - Number(x.sazonal)) ||
    (ordemStatus[x.status] - ordemStatus[y.status]) ||
    (y.valor_total - x.valor_total),
  );
  return { itens, total: itens.length, sugeridas: itens.filter((i) => i.n_clientes_epoca > 0).length };
}

// Clientes que compram um GRUPO (Tipo ou SKU) — para o expand da aba por produto.
// sel.tipo = nome do Tipo (resolve os codigo_produto via produto_tipo); ou sel.produto = codigo_produto.
export interface ClienteGrupoRow {
  codigo_cliente: string; conta: string; cliente: string; telefone: string;
  n_compras: number; qtd: number; valor: number; ultima_compra: string | null;
  sazonal: boolean; status: 'na_epoca' | 'chegando' | 'fora'; dias_para_epoca: number | null; ja_comprou_ciclo: boolean;
  mes_tipico: string | null; janela_label: string | null; concentracao: number; anos_recorrencia: number;
  representante_codigo_produto: string; representante_sku: string; representante_descricao: string;
  ultimo_contato: UltimoContato | null;
}

export async function clientesPorGrupo(conta: ContaFiltro, sel: { tipo?: string; produto?: string }, opts?: { mes?: number; lead?: number }): Promise<{ grupo: string; itens: ClienteGrupoRow[] }> {
  const produtos = await carregarProdutosMap(conta);
  let targetCods: string[] = [];
  let grupoLabel = '';
  if (sel.tipo) {
    const tipoMap = await carregarTipoCaracteristica(conta);
    const alvo = norm(sel.tipo);
    grupoLabel = sel.tipo;
    for (const [codP, tp] of Object.entries(tipoMap)) if (norm(tp) === alvo) targetCods.push(codP);
  } else if (sel.produto) {
    targetCods = [String(sel.produto)];
    const cad = produtos.get(String(sel.produto));
    grupoLabel = cad?.descricao || cad?.sku || String(sel.produto);
  } else {
    throw new Error('informe tipo ou produto');
  }
  if (targetCods.length === 0) return { grupo: grupoLabel, itens: [] };

  interface SkuAgg { valor: number; qtd: number; desc: string }
  interface CliAgg { conta: string; cod: string; pedidoMes: Map<string, { mes: number; ano: number }>; valor: number; qtd: number; ultima: Date | null; ultimaStr: string | null; skus: Map<string, SkuAgg>; nomeFallback: string }
  const agg = new Map<string, CliAgg>();
  const codsPorConta = new Map<string, Set<number>>();

  for (let i = 0; i < targetCods.length; i += 200) {
    const slice = targetCods.slice(i, i + 200);
    let off = 0;
    for (;;) {
      const { data, error } = await filtroConta(
        supabase.from('vendas_itens').select('codigo_produto,codigo_cliente,nome_cliente,numero_pedido,quantidade,valor_total,data_pedido,descricao,conta_omie').in('codigo_produto', slice).order('id', { ascending: true }),
        conta,
      ).range(off, off + LOTE - 1);
      if (error) throw new Error(error.message);
      const lote = (data || []) as Array<Record<string, unknown>>;
      for (const v of lote) {
        const cod = String(v.codigo_cliente ?? '').trim();
        if (!cod || !/^\d+$/.test(cod)) continue;
        const dt = parseDataBR(v.data_pedido);
        if (!dt) continue;
        const contaV = String(v.conta_omie ?? '').toUpperCase();
        const chave = contaV + '|' + cod;
        let a = agg.get(chave);
        if (!a) { a = { conta: contaV, cod, pedidoMes: new Map(), valor: 0, qtd: 0, ultima: null, ultimaStr: null, skus: new Map(), nomeFallback: '' }; agg.set(chave, a); }
        const ped = String(v.numero_pedido ?? '').trim();
        if (ped && !a.pedidoMes.has(ped)) a.pedidoMes.set(ped, { mes: dt.getMonth() + 1, ano: dt.getFullYear() });
        const valor = num(v.valor_total), qtd = num(v.quantidade);
        a.valor += valor; a.qtd += qtd;
        if (!a.ultima || dt > a.ultima) { a.ultima = dt; a.ultimaStr = String(v.data_pedido); }
        const codProd = String(v.codigo_produto ?? '');
        let s = a.skus.get(codProd);
        if (!s) { s = { valor: 0, qtd: 0, desc: (produtos.get(codProd)?.descricao) || String(v.descricao ?? '') || codProd }; a.skus.set(codProd, s); }
        s.valor += valor; s.qtd += qtd;
        if (!a.nomeFallback && v.nome_cliente) a.nomeFallback = String(v.nome_cliente).trim();
        if (!codsPorConta.has(contaV)) codsPorConta.set(contaV, new Set());
        codsPorConta.get(contaV)!.add(Number(cod));
      }
      if (lote.length < LOTE) break;
      off += LOTE;
    }
  }

  const agora = new Date();
  const mesHoje = opts?.mes && opts.mes >= 1 && opts.mes <= 12 ? opts.mes : agora.getMonth() + 1;
  const lead = opts?.lead && opts.lead > 0 ? opts.lead : SAZ_LEAD_DIAS;

  interface Pre { a: CliAgg; an: AnaliseSazonal; rep: string; repSku: string; repDesc: string }
  const pres: Pre[] = [];
  for (const a of agg.values()) {
    const an = analisarGrupoSazonal([...a.pedidoMes.values()], a.ultima, agora, mesHoje, agora.getDate(), lead);
    if (!an) continue;
    let rep = '', repSku = '', repDesc = '', repVal = -1;
    for (const [codP, s] of a.skus) if (s.valor > repVal) { repVal = s.valor; rep = codP; repSku = (produtos.get(codP)?.sku) || codP; repDesc = s.desc; }
    pres.push({ a, an, rep, repSku, repDesc });
  }

  const contatoPorChave = await carregarUltimosContatos(pres.map((p) => p.rep));
  const nomes = await resolverNomesClientes(codsPorConta);

  const itens: ClienteGrupoRow[] = pres.map((p) => {
    const a = p.a;
    const info = nomes.get(a.conta + '|' + a.cod);
    return {
      codigo_cliente: a.cod, conta: a.conta,
      cliente: info?.nome || a.nomeFallback || ('#' + a.cod),
      telefone: info?.telefone || '',
      n_compras: a.pedidoMes.size, qtd: a.qtd, valor: a.valor, ultima_compra: a.ultimaStr,
      sazonal: p.an.sazonal, status: p.an.status, dias_para_epoca: p.an.dias_para_epoca, ja_comprou_ciclo: p.an.ja_comprou_ciclo,
      mes_tipico: p.an.sazonal ? p.an.mes_tipico : null, janela_label: p.an.sazonal ? p.an.janela_label : null,
      concentracao: p.an.concentracao, anos_recorrencia: p.an.anos,
      representante_codigo_produto: p.rep, representante_sku: p.repSku, representante_descricao: p.repDesc,
      ultimo_contato: contatoPorChave.get(p.rep + '|' + a.conta + '|' + a.cod) || null,
    };
  });

  const ordemStatus: Record<ClienteGrupoRow['status'], number> = { na_epoca: 0, chegando: 1, fora: 2 };
  itens.sort((x, y) =>
    (Number(y.sazonal) - Number(x.sazonal)) ||
    (ordemStatus[x.status] - ordemStatus[y.status]) ||
    (Number(x.ja_comprou_ciclo) - Number(y.ja_comprou_ciclo)) ||
    (y.valor - x.valor),
  );
  return { grupo: grupoLabel, itens };
}
