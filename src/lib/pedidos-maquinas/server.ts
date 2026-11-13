// Pedido de Máquinas — acesso ao banco (service role). Só servidor.
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { protegerRota, type UsuarioRota } from '@/lib/ajustes/permissao-server';
import {
  arrumarParcelas, totalItens, type ItemPedidoMaquina, type ParcelaPedidoMaquina,
} from './regras';

export const MODULO = 'pedidos-maquinas';

export const T = {
  pedidos: 'pedidos_maquinas',
  itens: 'pedidos_maquinas_itens',
  parcelas: 'pedidos_maquinas_parcelas',
  logs: 'pedidos_maquinas_logs',
  hist: 'pedidos_maquinas_status_hist',
} as const;

export class ErroPedido extends Error {
  constructor(public status: number, msg: string, public extra?: Record<string, unknown>) { super(msg); }
}

export function faltaTabela(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(e.message || ''));
}

export const MSG_MIGRACAO = 'Falta aplicar sql/pedidos-maquinas.sql no Supabase.';

export function respostaErro(e: unknown, onde: string): Response {
  if (e instanceof ErroPedido) {
    return Response.json({ error: e.message, ...(e.extra || {}) }, { status: e.status });
  }
  const err = e as { code?: string; message?: string };
  if (faltaTabela(err)) return Response.json({ error: MSG_MIGRACAO, migracaoFaltando: true }, { status: 503 });
  console.error(`[pedidos-maquinas] ${onde}:`, err?.message || e);
  return Response.json({ error: err?.message || 'Erro interno' }, { status: 500 });
}

/** Guarda: `acao` = ação do módulo (criar/editar/enviar_omie/faturar/...); sem ação = ver. */
export async function guardar(req: Request, acao?: string) {
  return protegerRota(req, [{ modulo: MODULO, ...(acao ? { acao } : {}) }]);
}

export function autor(u: UsuarioRota): string {
  return u.nome || u.email || u.id;
}

function ok<T>(r: { data: T; error: { code?: string; message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data;
}

export interface PedidoMaquina {
  id: number;
  id_pedido: string;
  status: string;
  status_desde: string | null;
  empresa: string;
  cliente: string | null;
  cliente_documento: string | null;
  cliente_cod_omie: number | null;
  vendedor_id: number | null;
  proposta_id: number | null;
  valor_total: number;
  previsao_faturamento: string | null;
  observacao: string | null;
  categoria_pedido: string | null;
  conta_corrente: string | null;
  cenario_fiscal: string | null;
  num_contrato: string | null;
  contato: string | null;
  dados_nf: string | null;
  consumo_final: boolean;
  departamentos: Array<{ codigo: string; perc: number }>;
  projeto: string | null;
  pedido_omie: string | null;
  omie_codigo_pedido: number | null;
  enviado_omie_em: string | null;
  nf_numero: string | null;
  faturado_omie_em: string | null;
  faturado_por: string | null;
  faturando_desde: string | null;
  motivo_cancelamento: string | null;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

export const CAMPOS_EDITAVEIS = [
  'cliente', 'cliente_documento', 'vendedor_id', 'previsao_faturamento', 'observacao', 'empresa',
  'categoria_pedido', 'conta_corrente', 'cenario_fiscal', 'num_contrato', 'contato', 'dados_nf',
  'consumo_final', 'departamentos', 'projeto',
] as const;

export async function lerPedido(id: number | string) {
  const col = typeof id === 'string' && /^PVM-/i.test(id) ? 'id_pedido' : 'id';
  const p = ok(await supabaseAdmin.from(T.pedidos).select('*').eq(col, col === 'id' ? Number(id) : String(id).toUpperCase()).maybeSingle()) as PedidoMaquina | null;
  if (!p) throw new ErroPedido(404, 'Pedido não encontrado.');
  return p;
}

export async function lerCompleto(id: number | string) {
  const pedido = await lerPedido(id);
  const [itens, parcelas, logs, vendedor] = await Promise.all([
    supabaseAdmin.from(T.itens).select('*').eq('pedido_id', pedido.id).order('id'),
    supabaseAdmin.from(T.parcelas).select('*').eq('pedido_id', pedido.id).order('n'),
    supabaseAdmin.from(T.logs).select('*').eq('pedido_id', pedido.id).order('criado_em', { ascending: false }).limit(100),
    pedido.vendedor_id ? supabaseAdmin.from('vendedores').select('id, nome').eq('id', pedido.vendedor_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  let proposta: Record<string, unknown> | null = null;
  if (pedido.proposta_id) {
    const r = await supabaseAdmin.from('v_formulario')
      .select('id, "Cliente", "Modelo", "Marca", "Valor_Total", status, vendedor_nome, deleted_at')
      .eq('id', pedido.proposta_id).maybeSingle();
    proposta = (r.data as Record<string, unknown>) || { id: pedido.proposta_id, removida: true };
  }
  return {
    pedido,
    itens: (ok(itens) || []) as (ItemPedidoMaquina & { id: number })[],
    parcelas: ((ok(parcelas) || []) as ParcelaPedidoMaquina[]).map((p) => ({ ...p, valor: Number(p.valor), percentual: Number(p.percentual) })),
    logs: ok(logs) || [],
    vendedor: (vendedor.data as { id: number; nome: string } | null) || null,
    proposta,
  };
}

export async function log(pedidoId: number, acao: string, usuario: string, detalhes?: Record<string, unknown>) {
  await supabaseAdmin.from(T.logs).insert({ pedido_id: pedidoId, acao, usuario, detalhes: detalhes ?? null });
}

/** Recalcula o valor_total pelos itens (e os percentuais das parcelas). */
export async function recalcularTotal(pedidoId: number): Promise<number> {
  const itens = (ok(await supabaseAdmin.from(T.itens).select('qtde, preco, desconto').eq('pedido_id', pedidoId)) || []) as ItemPedidoMaquina[];
  const total = totalItens(itens.map((i) => ({ ...i, qtde: Number(i.qtde), preco: Number(i.preco), desconto: Number(i.desconto) })));
  ok(await supabaseAdmin.from(T.pedidos).update({ valor_total: total }).eq('id', pedidoId));
  return total;
}

/** Troca as parcelas inteiras (renumera e refaz percentuais sobre o total). */
export async function gravarParcelas(pedidoId: number, parcelas: ParcelaPedidoMaquina[], total: number) {
  const arrumadas = arrumarParcelas(parcelas, total);
  ok(await supabaseAdmin.from(T.parcelas).delete().eq('pedido_id', pedidoId));
  if (arrumadas.length) {
    ok(await supabaseAdmin.from(T.parcelas).insert(arrumadas.map((p) => ({
      pedido_id: pedidoId, n: p.n, vencimento: p.vencimento, valor: p.valor, percentual: p.percentual,
      meio: p.meio, entrada: p.entrada, origem_proposta_parcela: p.origem_proposta_parcela,
    }))));
  }
  return arrumadas;
}

export function exigirEditavel(p: PedidoMaquina) {
  if (p.status === 'faturado') throw new ErroPedido(409, 'Pedido faturado não pode ser alterado.');
  if (p.status === 'cancelado') throw new ErroPedido(409, 'Pedido cancelado não pode ser alterado.');
  if (p.pedido_omie) throw new ErroPedido(409, `Pedido já está na Omie (nº ${p.pedido_omie}). Para mudar, cancele e faça outro.`);
}

export function normalizarParcelasCorpo(lista: unknown): ParcelaPedidoMaquina[] {
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, 240).map((x: Record<string, unknown>, i) => ({
    n: i + 1,
    vencimento: typeof x?.vencimento === 'string' ? x.vencimento.slice(0, 10) : '',
    valor: Math.round((Number(x?.valor) || 0) * 100) / 100,
    percentual: Number(x?.percentual) || 0,
    meio: (['boleto', 'cheque', 'financiamento', 'pix', 'outro'].includes(String(x?.meio)) ? x.meio : 'boleto') as ParcelaPedidoMaquina['meio'],
    entrada: x?.entrada === true,
    origem_proposta_parcela: x?.origem_proposta_parcela == null || x?.origem_proposta_parcela === '' ? null : Number(x.origem_proposta_parcela),
  })).filter((p) => p.valor > 0);
}
