/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Pedidos de venda abertos + encerramento informal.
// Portado de server.js (obterPedidos, listarPedidosEnriquecidos, obterMapa*,
// /api/pedidos/encerrar-informal, /api/encerramentos-informais, /saude-mensal).
//
// Adaptacoes vs. o app original:
//  - `conta` JA e' 'NOVA'/'CASTRO' (= conta_omie). Nao ha mais minusculo + labelConta.
//  - supabaseAdmin -> `supabase` (service role com fallback anon).
//  - cache em memoria single-instance (lib/ajustes/cache).
// ============================================================================

import type { Conta } from './conta';
import { labelConta } from './conta';
import { supabase } from './supabase';
import * as cache from './cache';
import { fmtBR, hoje } from './dates';
import { httpErr } from './cmc';
import {
  listarPedidos,
  consultarPedido,
  alterarObservacaoPedido,
  cancelarPedido,
  normalizarPedido,
  listarClientesResumido,
  listarEtapasPedido,
  listarUsuarios,
  incluirAjusteEstoque,
  listarLocaisEstoque,
} from './omie';

// ---- Helpers de data ----

// Calcula dias entre hoje e a data BR (DD/MM/YYYY).
function diasDesdeBR(dataBR: string | null | undefined): number | null {
  if (!dataBR) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(dataBR);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// Chave ordenavel YYYYMMDD a partir de uma data BR (DD/MM/YYYY). null se nao parseia.
function chaveDataBR(dataBR: string | null | undefined): number | null {
  if (!dataBR) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(dataBR);
  return m ? (+m[3] * 10000 + +m[2] * 100 + +m[1]) : null;
}

// Filtra pedidos pela data de INCLUSAO dentro de [dataDeBR, dataAteBR] (inclusive).
// A Omie (ListarPedidos) filtra por data de REGISTRO (inclusao OU alteracao), entao
// pedidos antigos que foram mexidos dentro da janela vazam para a lista e a coluna
// "Inclusao" acaba mostrando meses fora do periodo. Este guard garante que a janela
// seja respeitada de fato (na tela e em todos os exports). Pedidos sem data legivel
// NAO sao descartados (conservador).
function filtrarJanelaInclusao(pedidos: any[], dataDeBR: string, dataAteBR: string): any[] {
  const kDe = chaveDataBR(dataDeBR);
  const kAte = chaveDataBR(dataAteBR);
  if (kDe == null && kAte == null) return pedidos;
  return pedidos.filter((p: any) => {
    const k = chaveDataBR(p.dataInclusao || p.dataPrevisao);
    if (k == null) return true;
    if (kDe != null && k < kDe) return false;
    if (kAte != null && k > kAte) return false;
    return true;
  });
}

// ---- Mapas (clientes / etapas / usuarios) com cache ----

// Mapa identificador_omie -> nome do usuario, por conta (cache 12h). Usado pra
// mostrar "Criado por"/"Alterado por" no pedido: infoCadastro.uInc/uAlt trazem o
// CODIGO interno do usuario (ex.: "P000454175"), nunca o nome.
//
// Shape confirmado em runtime (ListarUsuarios): { cNome, cNomeCompl, cEmail,
// nCodUsuario }. Cuidado com a nomenclatura invertida da Omie: `cNome` e' o
// codigo (== uInc) e `cNomeCompl` e' o nome de verdade. Indexamos tambem por
// nCodUsuario e email por seguranca.
export async function obterMapaUsuarios(conta: Conta): Promise<Record<string, string>> {
  const chave = `usuarios_map:${conta}`;
  const hit = cache.get<Record<string, string>>(chave);
  if (hit) return hit.valor;
  let arr: any[] = [];
  try { arr = await listarUsuarios(conta); } catch (e) { console.warn('[usuarios]', (e as Error).message); }
  const map: Record<string, string> = {};
  const por = (k: any, nome: string) => { if (k != null && k !== '') map[String(k).toUpperCase()] = nome; };
  for (const u of (arr || [])) {
    const nome = u.cNomeCompl || u.cNomeCompleto || u.nomeCompleto || u.nome || null;
    if (!nome) continue;
    por(u.cNome, nome);        // codigo interno — e' o que casa com uInc/uAlt
    por(u.nCodUsuario, nome);
    por(u.cEmail, nome); por(u.email, nome);
    por(u.cLogin, nome); por(u.login, nome);
  }
  cache.set(chave, map, 43200); // 12h
  return map;
}

// Mapa codigo_cliente -> {nome, cnpj, cidade} por conta (cache 1h).
export async function obterMapaClientes(conta: Conta): Promise<Record<string, { nome: string; cnpj: string | null; cidade: string | null }>> {
  const chave = `clientes_map:${conta}`;
  const hit = cache.get<Record<string, { nome: string; cnpj: string | null; cidade: string | null }>>(chave);
  if (hit) return hit.valor;
  let arr: any[] = [];
  try { arr = await listarClientesResumido(conta); } catch (e) { console.warn('[clientes]', (e as Error).message); }
  const map: Record<string, { nome: string; cnpj: string | null; cidade: string | null }> = {};
  for (const c of (arr || [])) {
    const cod = c.codigo_cliente ?? c.nCod ?? c.codigo;
    if (cod == null) continue;
    const nome = c.nome_fantasia || c.razao_social || c.cnome || c.nome || null;
    if (!nome) continue;
    map[String(cod)] = { nome, cnpj: c.cnpj_cpf || null, cidade: c.cidade || null };
  }
  cache.set(chave, map, 3600); // 1h
  return map;
}

// Mapa cEtapa -> descricao por conta (cache 24h, com fallback de rotulos padrao).
export async function obterMapaEtapasPedido(conta: Conta): Promise<Record<string, string>> {
  const chave = `etapas_pedido_map:${conta}`;
  const hit = cache.get<Record<string, string>>(chave);
  if (hit) return hit.valor;
  let arr: any[] = [];
  try { arr = await listarEtapasPedido(conta); } catch (e) { console.warn('[etapas]', (e as Error).message); }
  const map: Record<string, string> = {};
  for (const e of (arr || [])) {
    const cod = e.cEtapa || e.cCodigo || e.codigo || e.cCodEtapa;
    const desc = e.cDescricao || e.descricao || e.nome || null;
    if (cod && desc) map[String(cod)] = desc;
  }
  if (Object.keys(map).length === 0) {
    Object.assign(map, {
      '00': 'Aberto', '10': 'Em separacao', '20': 'Em producao', '30': 'Aguardando aprovacao',
      '40': 'Aguardando faturamento', '50': 'Faturado', '60': 'Concluido', '70': 'Cancelado',
      '80': 'Aprovado', '90': 'Reprovado',
    });
  }
  cache.set(chave, map, 86400); // 24h
  return map;
}

// ---- Pedidos abertos (com cache 5min) ----

export interface PedidosPayload {
  conta: Conta;
  contaLabel: Conta;
  dataDeBR: string;
  dataAteBR: string;
  total: number;
  pedidos: any[];
  geradoEm: string;
  duracaoMs: number;
  fonte?: 'cache' | 'live';
  cachedEm?: string;
}

// Pedidos de venda abertos (com cache 5min). Usado pela tela /pedidos.
export async function obterPedidos(conta: Conta, dataDeBR: string, dataAteBR: string, force = false, ttlSeg?: number): Promise<PedidosPayload> {
  const chave = `pedidos:${conta}:${dataDeBR}:${dataAteBR}`;
  if (!force) {
    const hit = cache.get<PedidosPayload>(chave);
    if (hit) return { ...hit.valor, fonte: 'cache', cachedEm: hit.gravadoEm };
  }
  const t0 = Date.now();
  // Omie nao tem status "ATIVO" no filtro; listamos tudo e filtramos em memoria
  // os nao-cancelados/nao-faturados.
  const [lista, mapaClientes, mapaEtapas, mapaUsuarios] = await Promise.all([
    listarPedidos(conta, dataDeBR, dataAteBR, {}),
    obterMapaClientes(conta),
    obterMapaEtapasPedido(conta),
    obterMapaUsuarios(conta),
  ]);
  const pedidos = filtrarJanelaInclusao(
    (lista || []).map(normalizarPedido).filter((p: any) => p && !p.cancelada && !p.faturada),
    dataDeBR, dataAteBR,
  );
  for (const p of pedidos) {
    const cli = p.codigoCliente != null ? mapaClientes[String(p.codigoCliente)] : null;
    p.nomeCliente = cli ? cli.nome : null;
    p.etapaNome = p.etapa ? (mapaEtapas[String(p.etapa)] || null) : null;
    if (p.criadoPorLogin) p.criadoPorNome = mapaUsuarios[String(p.criadoPorLogin).toUpperCase()] || p.criadoPorLogin;
    if (p.alteradoPorLogin) p.alteradoPorNome = mapaUsuarios[String(p.alteradoPorLogin).toUpperCase()] || p.alteradoPorLogin;
    p.diasParadoEtapa = diasDesdeBR(p.dataAlteracao || p.dataInclusao);
  }
  const payload: PedidosPayload = {
    conta, contaLabel: labelConta(conta), dataDeBR, dataAteBR,
    total: pedidos.length, pedidos, geradoEm: new Date().toISOString(), duracaoMs: Date.now() - t0,
  };
  cache.set(chave, payload, ttlSeg || 300); // default 5min
  return { ...payload, fonte: 'live' };
}

// Lista enriquecida de pedidos abertos p/ 1 conta, sem o cache da rota (usado
// pelos exports CSV/PDF e pelo consolidado de pedidos antigos).
export async function listarPedidosEnriquecidos(conta: Conta, dataDeBR: string, dataAteBR: string): Promise<any[]> {
  const [lista, mapaClientes, mapaEtapas, mapaUsuarios] = await Promise.all([
    listarPedidos(conta, dataDeBR, dataAteBR, {}),
    obterMapaClientes(conta),
    obterMapaEtapasPedido(conta),
    obterMapaUsuarios(conta),
  ]);
  const pedidos = filtrarJanelaInclusao(
    (lista || []).map(normalizarPedido).filter((p: any) => p && !p.cancelada && !p.faturada),
    dataDeBR, dataAteBR,
  );
  const contaLabel = labelConta(conta);
  for (const p of pedidos) {
    const cli = p.codigoCliente != null ? mapaClientes[String(p.codigoCliente)] : null;
    p.nomeCliente = cli ? cli.nome : null;
    p.etapaNome = p.etapa ? (mapaEtapas[String(p.etapa)] || null) : null;
    if (p.criadoPorLogin) p.criadoPorNome = mapaUsuarios[String(p.criadoPorLogin).toUpperCase()] || p.criadoPorLogin;
    if (p.alteradoPorLogin) p.alteradoPorNome = mapaUsuarios[String(p.alteradoPorLogin).toUpperCase()] || p.alteradoPorLogin;
    p.contaLabel = contaLabel;
    p.diasAberto = diasDesdeBR(p.dataInclusao || p.dataPrevisao);
    p.diasParadoEtapa = diasDesdeBR(p.dataAlteracao || p.dataInclusao);
  }
  return pedidos;
}

// Consolidado de pedidos abertos ha >= diasMin, das duas contas, ordenado por
// (criadoPor asc, mais antigos primeiro dentro do grupo). Usado pelos exports
// e pela tela /pedidos-antigos.
export async function listarPedidosAntigosTodasContas(contas: Conta[], dataDeBR: string, dataAteBR: string, diasMin: number): Promise<any[]> {
  const tudo: any[] = [];
  for (const c of contas) {
    try {
      const peds = await listarPedidosEnriquecidos(c, dataDeBR, dataAteBR);
      peds.filter((p: any) => (p.diasAberto || 0) >= diasMin).forEach((p: any) => tudo.push(p));
    } catch (e) { console.warn(`[pedidos-antigos] ${c}: ${(e as Error).message}`); }
  }
  tudo.sort((a, b) => {
    const an = (a.criadoPorNome || a.criadoPorLogin || '~').toLowerCase();
    const bn = (b.criadoPorNome || b.criadoPorLogin || '~').toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return (b.diasAberto || 0) - (a.diasAberto || 0); // mais antigos primeiro dentro do grupo
  });
  return tudo;
}

// ---- Encerramento informal ----

export interface EncerrarPedidoArgs {
  conta: Conta;
  idPedido: number | string | null;
  numeroPedido?: string | null;
  razao: string;
  criadoPor?: string;
}

// Encerra um pedido "de forma informal":
//  1) Para cada item: IncluirAjusteEstoque tipo=SAI motivo='OPS' (baixa) com obs
//     referenciando o pedido e a razao.
//  2) AlterarPedidoVenda observacoes acrescentando "[Encerrado informalmente...] <razao>".
//  3) ExcluirPedido (cancelarPedido).
//  4) Log na tabela pedidos_encerrados_informais com status aplicado/parcial/erro.
// PRESERVA a ordem e a auditoria EXATAS do app original.
export async function encerrarPedidoInformal(args: EncerrarPedidoArgs): Promise<any> {
  const conta = args.conta;
  const idPedido = args.idPedido != null ? Number(args.idPedido) : null;
  const razao = (args.razao || '').toString().trim();
  if (!idPedido) throw httpErr(400, 'informe idPedido');
  if (razao.length < 3) throw httpErr(400, 'informe a razao (minimo 3 caracteres)');

  // pre-flight: tabela existe?
  try {
    const { error: pe } = await supabase.from('pedidos_encerrados_informais').select('id').limit(1);
    if (pe) throw new Error(pe.message);
  } catch (e) {
    throw httpErr(503, `tabela pedidos_encerrados_informais indisponivel - rodar sql/cmc_correcoes_init.sql (${(e as Error).message})`);
  }

  // 1) consulta o pedido pra pegar os itens e dados
  const pedidoRaw = await consultarPedido(conta, { idPedido });
  const pedido = normalizarPedido(pedidoRaw);
  if (!pedido) throw httpErr(404, 'pedido nao encontrado');
  if (pedido.cancelada) throw httpErr(400, 'pedido ja esta cancelado');
  if (pedido.faturada) throw httpErr(400, 'pedido ja foi faturado - nao da p/ encerrar informalmente');
  if (!pedido.itens.length) throw httpErr(400, 'pedido sem itens');

  const dataBR = fmtBR(hoje());
  const obsBaixa = `Baixa informal - pedido ${pedido.numero || idPedido}${pedido.codigoCliente ? ' - cli ' + pedido.codigoCliente : ''} - ${razao}`.slice(0, 240);

  // local de estoque padrao (uma unica chamada) p/ itens sem codLocalEstoque proprio
  let localPadraoId: any = null;
  try {
    const locais = await listarLocaisEstoque(conta);
    const padrao = (locais || []).find((l: any) => l.padrao) || (locais || [])[0];
    localPadraoId = padrao ? padrao.id : null;
  } catch (e) { console.warn('[encerrar-informal] locais:', (e as Error).message); }

  // 2) baixa cada item via SAI
  const resultadosItens: any[] = [];
  let temErro = false;
  for (const it of pedido.itens) {
    const localId = it.codLocalEstoque || localPadraoId;
    try {
      if (it.idProduto == null) throw new Error('item sem idProduto');
      if (!(it.qtde > 0)) throw new Error('qtde invalida');
      if (localId == null) throw new Error('sem local de estoque');
      const r = await incluirAjusteEstoque(conta, {
        idProd: it.idProduto, codLocal: localId, dataBR, tipo: 'SAI', quan: it.qtde,
        valor: it.valorUnit > 0 ? it.valorUnit : undefined, // Omie usa CMC vigente se nao passar
        // motivos validos no Omie: INV|OPS|PER|PDV. 'OPS' = Ordem de Producao/Saida (consumo interno)
        motivo: 'OPS', origem: 'AJU', obs: obsBaixa,
      });
      resultadosItens.push({ idProduto: it.idProduto, sku: it.codigo, codigo: it.codigo, descricao: it.descricao, qtde: it.qtde, codLocal: localId, idAjuste: r.codigoAjuste, idMovest: r.idMovest, valorUnit: it.valorUnit });
    } catch (e) {
      temErro = true;
      resultadosItens.push({ idProduto: it.idProduto, sku: it.codigo, codigo: it.codigo, descricao: it.descricao, qtde: it.qtde, codLocal: localId, valorUnit: it.valorUnit, erro: (e as any).faultstring || (e as Error).message });
    }
  }

  // 3) anexa razao na observacao do pedido
  const obsTxt = `[Encerrado informalmente em ${dataBR}] ${razao}`;
  let alterouObs = false, erroObs: string | null = null;
  try { await alterarObservacaoPedido(conta, { idPedido, observacoes: obsTxt, append: true }); alterouObs = true; }
  catch (e) { erroObs = (e as any).faultstring || (e as Error).message; }

  // 4) cancela o pedido
  let cancelado = false, erroCancel: string | null = null;
  try { await cancelarPedido(conta, { idPedido, numeroPedido: pedido.numero }); cancelado = true; }
  catch (e) { erroCancel = (e as any).faultstring || (e as Error).message; }

  const status = (!temErro && cancelado) ? 'aplicado' : (temErro && !cancelado ? 'erro' : 'parcial');

  const log = {
    conta_omie: labelConta(conta),
    id_pedido: idPedido, numero_pedido: pedido.numero, codigo_cliente: pedido.codigoCliente, nome_cliente: null,
    razao, itens: resultadosItens, status,
    erro: [temErro ? 'algum item nao baixou' : null, erroObs ? 'obs: ' + erroObs : null, erroCancel ? 'cancel: ' + erroCancel : null].filter(Boolean).join('; ') || null,
    raw_request: { idPedido, razao }, raw_response: { alterouObs, cancelado, itens: resultadosItens.length },
    criado_por: args.criadoPor || 'app-pedidos',
  };
  let logId: number | null = null;
  try {
    const { data, error } = await supabase.from('pedidos_encerrados_informais').insert(log).select('id').single();
    if (error) console.warn('[ped-inf] insert:', error.message);
    logId = data && (data as any).id;
  } catch (e) { console.warn('[ped-inf] insert:', (e as Error).message); }

  cache.invalidatePrefix(`pedidos:${conta}:`);

  return { ok: status !== 'erro', status, logId, idPedido, numero: pedido.numero, itens: resultadosItens, alterouObs, cancelado, erros: { obs: erroObs, cancel: erroCancel } };
}

// ---- Encerramentos (consulta Supabase) ----

export interface ListarEncerramentosOpts { conta?: Conta; de?: string; ate?: string }

export async function listarEncerramentos(opts: ListarEncerramentosOpts = {}): Promise<any[]> {
  let q = supabase.from('pedidos_encerrados_informais').select('*').order('criado_em', { ascending: false }).limit(500);
  if (opts.conta) q = q.eq('conta_omie', labelConta(opts.conta));
  if (opts.de) q = q.gte('criado_em', `${opts.de} 00:00:00`);
  if (opts.ate) q = q.lte('criado_em', `${opts.ate} 23:59:59`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function obterEncerramento(id: number | string): Promise<any> {
  const { data, error } = await supabase.from('pedidos_encerrados_informais').select('*').eq('id', id).single();
  if (error) throw httpErr(404, error.message);
  return data;
}

// ---- Saude mensal ----

export interface SaudeMensalArgs { conta?: Conta; ano: number; mes: number }

// KPIs historicos de correcoes + alertas + encerramentos do mes selecionado.
export async function saudeMensal(args: SaudeMensalArgs): Promise<any> {
  const { conta, ano, mes } = args;
  const inicioISO = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const fimDate = new Date(ano, mes, 0); // ultimo dia do mes
  const fimISO = `${ano}-${String(mes).padStart(2, '0')}-${String(fimDate.getDate()).padStart(2, '0')}`;
  const dados: { correcoes: any[]; encerramentos: any[]; alertas: any[]; erro: string | null } = { correcoes: [], encerramentos: [], alertas: [], erro: null };

  try {
    let qC = supabase.from('cmc_correcoes').select('*').gte('criado_em', `${inicioISO} 00:00:00`).lte('criado_em', `${fimISO} 23:59:59`);
    if (conta) qC = qC.eq('conta_omie', labelConta(conta));
    const rC = await qC;
    if (rC.error) throw new Error('cmc_correcoes: ' + rC.error.message);
    dados.correcoes = rC.data || [];

    let qE = supabase.from('pedidos_encerrados_informais').select('*').gte('criado_em', `${inicioISO} 00:00:00`).lte('criado_em', `${fimISO} 23:59:59`);
    if (conta) qE = qE.eq('conta_omie', labelConta(conta));
    const rE = await qE;
    if (rE.error) throw new Error('pedidos_encerrados: ' + rE.error.message);
    dados.encerramentos = rE.data || [];

    let qA = supabase.from('cmc_alertas').select('id, tipo, lido, criado_em, conta_omie, descricao_produto').gte('criado_em', `${inicioISO} 00:00:00`).lte('criado_em', `${fimISO} 23:59:59`);
    if (conta) qA = qA.eq('conta_omie', labelConta(conta));
    const rA = await qA;
    if (rA.error) throw new Error('cmc_alertas: ' + rA.error.message);
    dados.alertas = rA.data || [];
  } catch (e) { dados.erro = (e as Error).message; }

  // -------- KPIs --------
  const corrAplic = dados.correcoes.filter((c) => c.status === 'aplicado');
  const corrRevert = dados.correcoes.filter((c) => c.status === 'revertido');
  const corrErro = dados.correcoes.filter((c) => c.status === 'erro');
  let valorCorrigido = 0;
  for (const c of corrAplic) {
    const delta = Math.abs((Number(c.cmc_aplicado) || 0) - (Number(c.cmc_anterior) || 0));
    const qtd = Math.abs(Number(c.qtd_saldo_no_ajuste) || 0);
    if (delta > 0 && qtd > 0) valorCorrigido += delta * qtd;
  }
  const porProduto: Record<string, { codigo: string; descricao: string; count: number; valorEstim: number }> = {};
  for (const c of corrAplic) {
    const k = c.codigo_produto != null ? String(c.codigo_produto) : (c.codigo_integracao || '?');
    if (!porProduto[k]) porProduto[k] = { codigo: k, descricao: c.descricao_produto || '', count: 0, valorEstim: 0 };
    porProduto[k].count++;
    const delta = Math.abs((Number(c.cmc_aplicado) || 0) - (Number(c.cmc_anterior) || 0));
    const qtd = Math.abs(Number(c.qtd_saldo_no_ajuste) || 0);
    if (delta > 0 && qtd > 0) porProduto[k].valorEstim += delta * qtd;
  }
  const topProdutos = Object.values(porProduto).sort((a, b) => b.valorEstim - a.valorEstim || b.count - a.count).slice(0, 10);

  const porOrigem: Record<string, number> = {};
  for (const c of corrAplic) {
    const k = c.origem || 'dashboard';
    porOrigem[k] = (porOrigem[k] || 0) + 1;
  }

  const alertasPorTipo: Record<string, number> = {};
  for (const a of dados.alertas) alertasPorTipo[a.tipo] = (alertasPorTipo[a.tipo] || 0) + 1;
  const alertasNaoLidos = dados.alertas.filter((a) => !a.lido).length;

  const encOk = dados.encerramentos.filter((e) => e.status === 'aplicado').length;
  const encParcial = dados.encerramentos.filter((e) => e.status === 'parcial').length;
  const encErro = dados.encerramentos.filter((e) => e.status === 'erro').length;

  // Lista de meses pro seletor (12 ultimos)
  const agora = new Date();
  const meses: { v: string; nome: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const nome = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    meses.push({ v, nome });
  }

  return {
    conta: conta ? labelConta(conta) : null,
    mesSelecionado: `${ano}-${String(mes).padStart(2, '0')}`,
    nomeMes: new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    meses, dados, erro: dados.erro,
    kpis: {
      totalCorrAplic: corrAplic.length,
      totalCorrRevert: corrRevert.length,
      totalCorrErro: corrErro.length,
      valorCorrigido,
      porOrigem,
      topProdutos,
      totalEnc: dados.encerramentos.length,
      encOk, encParcial, encErro,
      alertasTotal: dados.alertas.length,
      alertasNaoLidos,
      alertasPorTipo,
    },
  };
}
