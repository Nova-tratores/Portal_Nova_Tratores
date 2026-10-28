/* eslint-disable @typescript-eslint/no-explicit-any */
// Boleto agrupado de fornecedor — banco + Omie. As regras vivem em
// boletos-fornecedor.ts (puro). Aqui: registrar (reprograma as duplicatas na
// Omie via aplicarCorrecaoLancamento), pagar uma parcela (baixa duplicata a
// duplicata via baixarTitulo), estornar (devolve o snapshot), regras por
// fornecedor e o mapa "duplicata já está em boleto ativo".
// Tabelas: sql/boletos-fornecedor.sql (RLS sem policy; só service role).

import type { Conta } from './conta';
import { supabase } from './supabase';
import { sleep, consultarConta } from './omie';
import { aplicarCorrecaoLancamento, baixarTitulo } from './contas';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import {
  alocar, camposPorTitulo, validarRegistro, planoBaixaParcela, statusPorParcelas, somar, arred,
  TOLERANCIA_PADRAO, type TituloSel, type ParcelaIn, type StatusBoleto,
} from './boletos-fornecedor';

export const SISTEMA_AUDIT = 'ajustes';
const STATUS_ATIVO: StatusBoleto[] = ['pendente', 'registrado', 'parcial', 'erro_omie'];
const RE_MIGRACAO = /boletos_fornecedor|boleto_parcelas|boleto_titulos|fornecedores_regra_boleto|PGRST205|42P01/i;

export function migracaoFaltando(msg: string): boolean {
  return RE_MIGRACAO.test(msg || '') && /not exist|PGRST205|42P01|schema cache|não existe|nao existe/i.test(msg || '');
}

function throttleMs(): number {
  const n = parseInt(process.env.CONTAS_THROTTLE_MS || '', 10);
  return n >= 0 ? n : 700;
}

// ---------------------------------------------------------------------------
// Regras por fornecedor
// ---------------------------------------------------------------------------
export interface RegraBoleto {
  id: string; conta_omie: Conta; codigo_cliente_fornecedor: number; nome: string; ativo: boolean;
  dias_tolerancia: number; tolerancia_valor: number; alinhar_vencimento: boolean; criado_por: string | null;
}

export async function listarRegras(conta?: Conta): Promise<RegraBoleto[]> {
  let q: any = supabase.from('fornecedores_regra_boleto').select('*').order('nome');
  if (conta) q = q.eq('conta_omie', conta);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as RegraBoleto[];
}

export async function salvarRegra(r: {
  id?: string | null; conta: Conta; codigoFornecedor: number; nome: string; ativo?: boolean;
  diasTolerancia?: number; toleranciaValor?: number; alinharVencimento?: boolean; criadoPor?: string | null;
}): Promise<RegraBoleto> {
  const linha: any = {
    conta_omie: r.conta,
    codigo_cliente_fornecedor: Number(r.codigoFornecedor),
    nome: String(r.nome || '').trim().slice(0, 120),
    ativo: r.ativo !== false,
    dias_tolerancia: Math.max(0, Math.min(120, Number(r.diasTolerancia ?? 10) || 0)),
    tolerancia_valor: Math.max(0, Math.min(1000, Number(r.toleranciaValor ?? TOLERANCIA_PADRAO) || 0)),
    alinhar_vencimento: r.alinharVencimento !== false,
    updated_at: new Date().toISOString(),
  };
  if (!linha.nome) throw new Error('informe o nome do fornecedor');
  if (!(linha.codigo_cliente_fornecedor > 0)) throw new Error('informe o código do fornecedor na Omie');
  if (r.id) {
    const { data, error } = await supabase.from('fornecedores_regra_boleto').update(linha).eq('id', r.id).select('*').single();
    if (error) throw new Error(error.message);
    return data as RegraBoleto;
  }
  linha.criado_por = r.criadoPor || null;
  const { data, error } = await supabase.from('fornecedores_regra_boleto')
    .upsert(linha, { onConflict: 'conta_omie,codigo_cliente_fornecedor' }).select('*').single();
  if (error) throw new Error(error.message);
  return data as RegraBoleto;
}

/** Regra ativa de um fornecedor (ou null). */
export async function regraDoFornecedor(conta: Conta, codigoFornecedor: number | null | undefined): Promise<RegraBoleto | null> {
  if (!codigoFornecedor) return null;
  const { data } = await supabase.from('fornecedores_regra_boleto').select('*')
    .eq('conta_omie', conta).eq('codigo_cliente_fornecedor', Number(codigoFornecedor)).eq('ativo', true).maybeSingle();
  return (data as RegraBoleto) || null;
}

/** Fornecedores com título a pagar no espelho que batem com `q` (para a tela de regras). */
export async function buscarFornecedores(conta: Conta, q: string): Promise<Array<{ codigo: number; nome: string; titulos: number }>> {
  const termo = String(q || '').trim();
  if (termo.length < 2) return [];
  const { data, error } = await supabase.from('contas_pagar')
    .select('codigo_cliente_fornecedor, nome_fornecedor')
    .eq('conta_omie', conta).ilike('nome_fornecedor', `%${termo.replace(/[%,()]/g, ' ')}%`).limit(1000);
  if (error) throw new Error(error.message);
  const mapa = new Map<number, { codigo: number; nome: string; titulos: number }>();
  for (const r of (data || []) as any[]) {
    const cod = Number(r.codigo_cliente_fornecedor) || 0;
    if (!cod) continue;
    const o = mapa.get(cod) || { codigo: cod, nome: String(r.nome_fornecedor || ''), titulos: 0 };
    o.titulos++;
    mapa.set(cod, o);
  }
  return Array.from(mapa.values()).sort((a, b) => b.titulos - a.titulos).slice(0, 30);
}

// ---------------------------------------------------------------------------
// Boletos
// ---------------------------------------------------------------------------
export interface BoletoLinha {
  id: string; conta_omie: Conta; codigo_cliente_fornecedor: number | null; nome_fornecedor: string; numero: string;
  codigo_barras: string | null; data_emissao: string | null; valor_total: number; valor_titulos: number;
  status: StatusBoleto; alinhar_vencimento: boolean; observacao: string | null; erro: string | null;
  criado_por: string | null; created_at: string; updated_at: string;
  parcelas: ParcelaLinha[]; titulos: TituloLinha[];
}
export interface ParcelaLinha {
  id: string; boleto_id: string; numero: number; total: number; data_vencimento: string; valor: number;
  status: 'aberta' | 'paga' | 'cancelada'; pago_em: string | null; codigo_conta_corrente: number | null; baixa_ids: number[];
}
export interface TituloLinha {
  id: string; boleto_id: string; parcela_id: string; conta_omie: Conta; codigo_lancamento: number;
  numero_documento: string | null; numero_documento_fiscal: string | null; valor_titulo: number; valor_alocado: number;
  principal: boolean; status: 'pendente' | 'aplicado' | 'erro' | 'baixado' | 'estornado'; erro: string | null;
  correcao_id: number | null; snapshot_anterior: Record<string, unknown> | null; campos_novos: Record<string, unknown> | null;
}

export async function listarBoletos(conta?: Conta, opts: { status?: 'ativos' | 'todos' | StatusBoleto; limite?: number } = {}): Promise<BoletoLinha[]> {
  let q: any = supabase.from('boletos_fornecedor').select('*').order('created_at', { ascending: false }).limit(Math.min(500, opts.limite || 200));
  if (conta) q = q.eq('conta_omie', conta);
  if (opts.status === 'ativos') q = q.in('status', STATUS_ATIVO);
  else if (opts.status && opts.status !== 'todos') q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const boletos = (data || []) as any[];
  if (!boletos.length) return [];
  const ids = boletos.map((b) => b.id);
  const [{ data: parcelas, error: e1 }, { data: titulos, error: e2 }] = await Promise.all([
    supabase.from('boleto_parcelas').select('*').in('boleto_id', ids).order('numero'),
    supabase.from('boleto_titulos').select('*').in('boleto_id', ids).order('created_at'),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  return boletos.map((b) => ({
    ...b,
    valor_total: Number(b.valor_total), valor_titulos: Number(b.valor_titulos),
    parcelas: ((parcelas || []) as any[]).filter((p) => p.boleto_id === b.id).map((p) => ({ ...p, valor: Number(p.valor) })),
    titulos: ((titulos || []) as any[]).filter((t) => t.boleto_id === b.id).map((t) => ({ ...t, valor_titulo: Number(t.valor_titulo), valor_alocado: Number(t.valor_alocado) })),
  }));
}

export async function obterBoleto(id: string): Promise<BoletoLinha | null> {
  const { data, error } = await supabase.from('boletos_fornecedor').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const lista = await listarBoletos((data as any).conta_omie, { status: 'todos', limite: 500 });
  return lista.find((b) => b.id === id) || null;
}

/** Duplicatas (codigo_lancamento) que já estão num boleto ativo desta empresa. */
export async function titulosEmBoletoAtivo(conta: Conta): Promise<Record<string, { boletoId: string; numero: string; status: StatusBoleto }>> {
  const { data, error } = await supabase.from('boletos_fornecedor').select('id, numero, status').eq('conta_omie', conta).in('status', STATUS_ATIVO);
  if (error) throw new Error(error.message);
  const boletos = (data || []) as any[];
  if (!boletos.length) return {};
  const { data: tit, error: e2 } = await supabase.from('boleto_titulos').select('codigo_lancamento, boleto_id').in('boleto_id', boletos.map((b) => b.id)).neq('status', 'estornado');
  if (e2) throw new Error(e2.message);
  const out: Record<string, { boletoId: string; numero: string; status: StatusBoleto }> = {};
  for (const t of (tit || []) as any[]) {
    const b = boletos.find((x) => x.id === t.boleto_id);
    if (b) out[String(t.codigo_lancamento)] = { boletoId: b.id, numero: b.numero, status: b.status };
  }
  return out;
}

/** Lê as duplicatas no ESPELHO (não confia no que a tela mandou): status, valor em aberto, fornecedor, origem. */
async function lerDuplicatas(conta: Conta, codigos: number[]): Promise<TituloSel[]> {
  const { data, error } = await supabase.from('contas_pagar')
    .select('codigo_lancamento, valor_documento, valor_pago, data_vencimento, data_previsao, numero_documento, numero_documento_fiscal, observacao, status_titulo, codigo_cliente_fornecedor, nome_fornecedor, id_origem:raw->>id_origem')
    .eq('conta_omie', conta).in('codigo_lancamento', codigos);
  if (error) throw new Error(error.message);
  return ((data || []) as any[]).map((r) => ({
    conta,
    codigoLancamento: Number(r.codigo_lancamento),
    numeroDoc: r.numero_documento || null,
    numeroDocFiscal: r.numero_documento_fiscal || null,
    valor: arred(Math.max(0, (Number(r.valor_documento) || 0) - (Number(r.valor_pago) || 0))),
    vencimento: r.data_vencimento || null,
    previsao: r.data_previsao || null,
    observacao: r.observacao || null,
    idOrigem: r.id_origem || null,
    codigoFornecedor: r.codigo_cliente_fornecedor != null ? Number(r.codigo_cliente_fornecedor) : null,
    contraparte: r.nome_fornecedor || null,
    status: r.status_titulo || null,
  }));
}

export interface RegistrarArgs {
  conta: Conta;
  codigos: number[];               // codigo_lancamento das duplicatas
  numero: string;
  codigoBarras?: string | null;
  dataEmissao?: string | null;
  parcelas: ParcelaIn[];
  alinharVencimento?: boolean;     // padrão = regra do fornecedor, senão true
  observacao?: string | null;
  criadoPor: string;
  userId?: string;
}

/** Registra o boleto e reprograma cada duplicata na Omie (previsão/vencimento/observação). */
export async function registrarBoleto(a: RegistrarArgs): Promise<{ ok: boolean; erro?: string; boleto?: BoletoLinha; aplicados?: number; falhas?: number; bloqueado?: boolean }> {
  const codigos = Array.from(new Set((a.codigos || []).map((c) => Number(c)).filter((c) => c > 0)));
  if (!codigos.length) return { ok: false, erro: 'selecione ao menos uma duplicata' };
  const titulos = await lerDuplicatas(a.conta, codigos);
  if (titulos.length !== codigos.length) return { ok: false, erro: `${codigos.length - titulos.length} duplicata(s) não encontrada(s) no espelho desta empresa` };
  const fechados = titulos.filter((t) => !['A VENCER', 'ATRASADO', 'VENCE HOJE'].includes(String(t.status || '').toUpperCase()));
  if (fechados.length) return { ok: false, erro: `duplicata(s) já baixada(s): ${fechados.map((t) => t.numeroDoc || t.codigoLancamento).join(', ')}` };
  const ativos = await titulosEmBoletoAtivo(a.conta);
  const repetidos = titulos.filter((t) => ativos[String(t.codigoLancamento)]);
  if (repetidos.length) return { ok: false, erro: `já está em outro boleto: ${repetidos.map((t) => `${t.numeroDoc || t.codigoLancamento} (boleto ${ativos[String(t.codigoLancamento)].numero})`).join(', ')}` };

  const codigoFornecedor = titulos[0].codigoFornecedor || null;
  const regra = await regraDoFornecedor(a.conta, codigoFornecedor);
  const tolerancia = regra ? Number(regra.tolerancia_valor) : TOLERANCIA_PADRAO;
  const alinhar = a.alinharVencimento != null ? !!a.alinharVencimento : regra ? !!regra.alinhar_vencimento : true;
  const parcelas: ParcelaIn[] = (a.parcelas || []).map((p, i) => ({ numero: Number(p.numero) || i + 1, dataVencimento: String(p.dataVencimento || '').slice(0, 10), valor: arred(Number(p.valor) || 0) }));
  const erro = validarRegistro({ titulos, parcelas, numero: a.numero, dataEmissao: a.dataEmissao }, tolerancia);
  if (erro) return { ok: false, erro };

  const { alocacoes } = alocar(titulos, parcelas);
  const nomeFornecedor = String(titulos[0].contraparte || regra?.nome || 'fornecedor').trim();
  const campos = camposPorTitulo(titulos, alocacoes, parcelas, { fornecedor: nomeFornecedor, numero: String(a.numero).trim(), alinharVencimento: alinhar });

  // 1) grava boleto + parcelas + títulos como pendente
  const { data: bol, error: eb } = await supabase.from('boletos_fornecedor').insert({
    conta_omie: a.conta, codigo_cliente_fornecedor: codigoFornecedor, nome_fornecedor: nomeFornecedor,
    numero: String(a.numero).trim(), codigo_barras: a.codigoBarras ? String(a.codigoBarras).replace(/\s/g, '').slice(0, 70) : null,
    data_emissao: a.dataEmissao || null, valor_total: somar(parcelas.map((p) => p.valor)), valor_titulos: somar(titulos.map((t) => t.valor)),
    status: 'pendente', alinhar_vencimento: alinhar, observacao: a.observacao || null, criado_por: a.criadoPor,
  }).select('*').single();
  if (eb) throw new Error(eb.message);
  const boletoId = (bol as any).id as string;
  const { data: parcs, error: ep } = await supabase.from('boleto_parcelas').insert(parcelas.map((p) => ({
    boleto_id: boletoId, numero: p.numero, total: parcelas.length, data_vencimento: p.dataVencimento, valor: p.valor,
  }))).select('*');
  if (ep) throw new Error(ep.message);
  const parcelaId = new Map(((parcs || []) as any[]).map((p) => [Number(p.numero), p.id as string]));
  const porCodigo = new Map(titulos.map((t) => [t.codigoLancamento, t]));
  const { error: et } = await supabase.from('boleto_titulos').insert(alocacoes.map((al) => {
    const t = porCodigo.get(al.codigoLancamento)!;
    const c = campos.find((x) => x.codigoLancamento === al.codigoLancamento);
    return {
      boleto_id: boletoId, parcela_id: parcelaId.get(al.parcelaNumero), conta_omie: a.conta, codigo_lancamento: al.codigoLancamento,
      numero_documento: t.numeroDoc, numero_documento_fiscal: t.numeroDocFiscal, valor_titulo: t.valor, valor_alocado: al.valor,
      principal: al.principal, status: 'pendente', campos_novos: al.principal && c ? c.campos : null,
    };
  }));
  if (et) throw new Error(et.message);

  // 2) reprograma na Omie, duplicata a duplicata
  const r = await aplicarPendentes(boletoId, a.criadoPor);
  await registrarAuditLog({
    userId: a.userId, userName: a.criadoPor, sistema: SISTEMA_AUDIT, acao: 'boleto-registrar', entidade: 'boletos_fornecedor', entidadeId: boletoId,
    entidadeLabel: `${nomeFornecedor} boleto ${a.numero}`,
    detalhes: { conta: a.conta, numero: a.numero, parcelas, titulos: codigos, valorTitulos: somar(titulos.map((t) => t.valor)), aplicados: r.aplicados, falhas: r.falhas, bloqueado: r.bloqueado },
  }).catch(() => {});
  const boleto = await obterBoleto(boletoId);
  return { ok: true, boleto: boleto || undefined, aplicados: r.aplicados, falhas: r.falhas, bloqueado: r.bloqueado };
}

/** Aplica na Omie os títulos ainda pendentes/erro do boleto (também serve ao botão "Reaplicar"). */
export async function aplicarPendentes(boletoId: string, criadoPor: string): Promise<{ aplicados: number; falhas: number; bloqueado: boolean }> {
  const { data: tit, error } = await supabase.from('boleto_titulos').select('*').eq('boleto_id', boletoId).eq('principal', true).in('status', ['pendente', 'erro']).order('created_at');
  if (error) throw new Error(error.message);
  const { data: bol } = await supabase.from('boletos_fornecedor').select('conta_omie').eq('id', boletoId).single();
  const conta = (bol as any).conta_omie as Conta;
  let aplicados = 0; let falhas = 0; let bloqueado = false; let primeiro = true;
  for (const t of (tit || []) as any[]) {
    if (bloqueado) { falhas++; continue; }
    if (!primeiro && throttleMs() > 0) await sleep(throttleMs());
    primeiro = false;
    const campos = (t.campos_novos || {}) as { dataPrevisao?: string; dataVencimento?: string; observacao?: string };
    const out = await aplicarCorrecaoLancamento({ conta, tipo: 'pagar', codigoLancamento: t.codigo_lancamento, campos, origem: 'boleto', criadoPor });
    if (out.ok) {
      aplicados++;
      const { data: corr } = await supabase.from('contas_correcoes').select('id').eq('conta_omie', conta).eq('codigo_lancamento', Number(t.codigo_lancamento)).order('id', { ascending: false }).limit(1).maybeSingle();
      await supabase.from('boleto_titulos').update({ status: 'aplicado', erro: null, correcao_id: (corr as any)?.id || null, snapshot_anterior: out.campos ? out.campos.anterior : (t.snapshot_anterior || {}), updated_at: new Date().toISOString() }).eq('id', t.id);
    } else {
      falhas++;
      if (out.bloqueio) bloqueado = true;
      await supabase.from('boleto_titulos').update({ status: 'erro', erro: String(out.erro || 'falha').slice(0, 500), updated_at: new Date().toISOString() }).eq('id', t.id);
    }
  }
  // as alocações secundárias (duplicata dividida em 2 parcelas) seguem o principal
  await supabase.from('boleto_titulos').update({ status: 'aplicado', updated_at: new Date().toISOString() }).eq('boleto_id', boletoId).eq('principal', false).eq('status', 'pendente');
  const { count } = await supabase.from('boleto_titulos').select('id', { count: 'exact', head: true }).eq('boleto_id', boletoId).in('status', ['pendente', 'erro']);
  const status: StatusBoleto = (count || 0) > 0 ? 'erro_omie' : 'registrado';
  await supabase.from('boletos_fornecedor').update({ status, erro: status === 'erro_omie' ? `${count} duplicata(s) não aplicada(s) na Omie${bloqueado ? ' (Omie bloqueou — tente em alguns minutos)' : ''}` : null, updated_at: new Date().toISOString() }).eq('id', boletoId);
  return { aplicados, falhas, bloqueado };
}

/** Paga UMA parcela: baixa cada duplicata alocada (valor alocado, teto = aberto na Omie agora). */
export async function pagarParcela(a: {
  boletoId: string; parcelaId: string; codigoContaCorrente: number; data: string; observacao?: string | null; conciliar?: boolean; criadoPor: string; userId?: string;
}): Promise<{ ok: boolean; erro?: string; baixados?: number; falhas?: number; jaPagos?: number[]; detalhes?: any[] }> {
  const boleto = await obterBoleto(a.boletoId);
  if (!boleto) return { ok: false, erro: 'boleto não encontrado' };
  if (boleto.status === 'cancelado') return { ok: false, erro: 'boleto cancelado' };
  if (boleto.status === 'pendente' || boleto.status === 'erro_omie') return { ok: false, erro: 'o boleto ainda não foi aplicado inteiro na Omie — use "Reaplicar" antes de pagar' };
  const parcela = boleto.parcelas.find((p) => p.id === a.parcelaId);
  if (!parcela) return { ok: false, erro: 'parcela não encontrada' };
  if (parcela.status === 'paga') return { ok: false, erro: `parcela ${parcela.numero}/${parcela.total} já está paga` };
  if (!(Number(a.codigoContaCorrente) > 0)) return { ok: false, erro: 'informe a conta corrente' };
  const alocacoes = boleto.titulos.filter((t) => t.status !== 'estornado').map((t) => ({
    codigoLancamento: Number(t.codigo_lancamento), parcelaNumero: boleto.parcelas.find((p) => p.id === t.parcela_id)?.numero || 0, valor: Number(t.valor_alocado), principal: !!t.principal,
  }));
  // valor em aberto AGORA, na Omie (não no espelho)
  const abertos = new Map<number, number>();
  const codigosParcela = Array.from(new Set(alocacoes.filter((x) => x.parcelaNumero === parcela.numero).map((x) => x.codigoLancamento)));
  for (const c of codigosParcela) {
    try {
      const t = await consultarConta(boleto.conta_omie, 'pagar', c);
      const st = String(t.status_titulo || '').toUpperCase();
      const doc = Number(t.valor_documento) || 0;
      const pago = Number(t.valor_pago) || 0;
      abertos.set(c, st === 'PAGO' || st === 'CANCELADO' ? 0 : arred(Math.max(0, doc - pago)));
      if (t.baixa_bloqueada === 'S') return { ok: false, erro: `duplicata ${c} está com baixa bloqueada na Omie` };
    } catch (e: any) {
      return { ok: false, erro: `Omie: ${e.faultstring || e.message}` };
    }
    if (throttleMs() > 0) await sleep(Math.min(300, throttleMs()));
  }
  const plano = planoBaixaParcela({ numero: parcela.numero, dataVencimento: parcela.data_vencimento, valor: parcela.valor }, alocacoes, abertos);
  if (plano.erro) return { ok: false, erro: plano.erro, jaPagos: plano.jaPagos };

  const detalhes: any[] = [];
  const baixaIds: number[] = [];
  let baixados = 0; let falhas = 0; let primeiro = true;
  const obs = `Boleto ${boleto.nome_fornecedor} nº ${boleto.numero} parc ${parcela.numero}/${parcela.total}${a.observacao ? ' — ' + a.observacao : ''}`.slice(0, 200);
  for (const b of plano.baixas) {
    if (!primeiro && throttleMs() > 0) await sleep(throttleMs());
    primeiro = false;
    const out = await baixarTitulo({
      conta: boleto.conta_omie, tipo: 'pagar', codigoLancamento: b.codigoLancamento, codigoContaCorrente: a.codigoContaCorrente,
      valor: b.valor, data: a.data, juros: b.juros, desconto: b.desconto, observacao: obs, conciliar: !!a.conciliar,
    });
    detalhes.push({ codigoLancamento: b.codigoLancamento, valor: b.valor, juros: b.juros || 0, desconto: b.desconto || 0, ok: out.ok, erro: out.erro || null });
    if (out.ok) {
      baixados++;
      const { data: bx } = await supabase.from('contas_baixas').select('id').eq('conta_omie', boleto.conta_omie).eq('codigo_lancamento', b.codigoLancamento).order('id', { ascending: false }).limit(1).maybeSingle();
      if ((bx as any)?.id) baixaIds.push(Number((bx as any).id));
      // a duplicata fica "baixada" no boleto quando TODA a sua alocação foi paga
      const restante = alocacoes.filter((x) => x.codigoLancamento === b.codigoLancamento && x.parcelaNumero !== parcela.numero)
        .map((x) => boleto.parcelas.find((p) => p.numero === x.parcelaNumero)).filter((p) => p && p.status !== 'paga');
      if (!restante.length) await supabase.from('boleto_titulos').update({ status: 'baixado', updated_at: new Date().toISOString() }).eq('boleto_id', boleto.id).eq('codigo_lancamento', b.codigoLancamento);
    } else {
      falhas++;
      if (/bloque/i.test(String(out.erro || ''))) break;
    }
  }
  if (!falhas) {
    await supabase.from('boleto_parcelas').update({ status: 'paga', pago_em: a.data.slice(0, 10), codigo_conta_corrente: Number(a.codigoContaCorrente), baixa_ids: baixaIds }).eq('id', parcela.id);
    const { data: ps } = await supabase.from('boleto_parcelas').select('status').eq('boleto_id', boleto.id);
    const status = statusPorParcelas((ps || []) as any[], boleto.status);
    await supabase.from('boletos_fornecedor').update({ status, updated_at: new Date().toISOString() }).eq('id', boleto.id);
  } else if (baixaIds.length) {
    await supabase.from('boleto_parcelas').update({ baixa_ids: baixaIds }).eq('id', parcela.id);
  }
  await registrarAuditLog({
    userId: a.userId, userName: a.criadoPor, sistema: SISTEMA_AUDIT, acao: 'boleto-pagar-parcela', entidade: 'boletos_fornecedor', entidadeId: boleto.id,
    entidadeLabel: `${boleto.nome_fornecedor} boleto ${boleto.numero} parc ${parcela.numero}/${parcela.total}`,
    detalhes: { conta: boleto.conta_omie, parcela: parcela.numero, valor: parcela.valor, data: a.data, contaCorrente: a.codigoContaCorrente, baixados, falhas, detalhes, diferenca: plano.diferenca },
  }).catch(() => {});
  if (falhas) return { ok: false, erro: `${falhas} baixa(s) falharam — veja os detalhes e tente de novo (as já feitas não se repetem)`, baixados, falhas, detalhes, jaPagos: plano.jaPagos };
  return { ok: true, baixados, falhas: 0, detalhes, jaPagos: plano.jaPagos };
}

/** Estorna o boleto: devolve vencimento/previsão/observação de cada duplicata ao que era. Só sem parcela paga. */
export async function estornarBoleto(a: { boletoId: string; criadoPor: string; userId?: string; motivo?: string | null }): Promise<{ ok: boolean; erro?: string; revertidos?: number; falhas?: number }> {
  const boleto = await obterBoleto(a.boletoId);
  if (!boleto) return { ok: false, erro: 'boleto não encontrado' };
  if (boleto.status === 'cancelado') return { ok: false, erro: 'boleto já cancelado' };
  if (boleto.parcelas.some((p) => p.status === 'paga')) return { ok: false, erro: 'boleto com parcela paga não pode ser estornado pelo portal (estorne a baixa na Omie primeiro)' };
  let revertidos = 0; let falhas = 0; let primeiro = true;
  for (const t of boleto.titulos.filter((x) => x.principal && x.status === 'aplicado')) {
    if (!primeiro && throttleMs() > 0) await sleep(throttleMs());
    primeiro = false;
    const snap = (t.snapshot_anterior || {}) as { dataVencimento?: string | null; dataPrevisao?: string | null; observacao?: string | null };
    const campos: Record<string, unknown> = {};
    if (snap.dataVencimento) campos.dataVencimento = snap.dataVencimento;
    if (snap.dataPrevisao) campos.dataPrevisao = snap.dataPrevisao;
    if (snap.observacao !== undefined) campos.observacao = snap.observacao || '';
    const out = Object.keys(campos).length
      ? await aplicarCorrecaoLancamento({ conta: boleto.conta_omie, tipo: 'pagar', codigoLancamento: t.codigo_lancamento, campos, origem: 'boleto-estorno', criadoPor: a.criadoPor })
      : { ok: true };
    if (out.ok) { revertidos++; await supabase.from('boleto_titulos').update({ status: 'estornado', updated_at: new Date().toISOString() }).eq('boleto_id', boleto.id).eq('codigo_lancamento', t.codigo_lancamento); }
    else { falhas++; await supabase.from('boleto_titulos').update({ erro: String(out.erro || 'falha no estorno').slice(0, 500) }).eq('id', t.id); }
  }
  if (!falhas) {
    await supabase.from('boleto_titulos').update({ status: 'estornado' }).eq('boleto_id', boleto.id).in('status', ['pendente', 'erro', 'aplicado']);
    await supabase.from('boleto_parcelas').update({ status: 'cancelada' }).eq('boleto_id', boleto.id);
    await supabase.from('boletos_fornecedor').update({ status: 'cancelado', erro: null, observacao: [boleto.observacao, a.motivo ? `Estornado: ${a.motivo}` : 'Estornado'].filter(Boolean).join(' · '), updated_at: new Date().toISOString() }).eq('id', boleto.id);
  }
  await registrarAuditLog({
    userId: a.userId, userName: a.criadoPor, sistema: SISTEMA_AUDIT, acao: 'boleto-estornar', entidade: 'boletos_fornecedor', entidadeId: boleto.id,
    entidadeLabel: `${boleto.nome_fornecedor} boleto ${boleto.numero}`, detalhes: { conta: boleto.conta_omie, revertidos, falhas, motivo: a.motivo || null },
  }).catch(() => {});
  if (falhas) return { ok: false, erro: `${falhas} duplicata(s) não voltaram na Omie — tente de novo`, revertidos, falhas };
  return { ok: true, revertidos, falhas: 0 };
}
