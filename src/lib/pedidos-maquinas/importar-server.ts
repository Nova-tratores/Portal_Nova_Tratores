// Importar uma Proposta para o Pedido de Máquinas (servidor).
// Nada é escrito em "Formulario": o vínculo mora em pedidos_maquinas.proposta_id.
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { T, ErroPedido, lerPedido, exigirEditavel, gravarParcelas, log, faltaTabela } from './server';
import { importarDaProposta, type PropostaResumo, type Importacao } from './regras';

export const COLS_PROPOSTA = 'id, "Cliente", "Cpf/Cpnj", "Cidade", "Marca", "Modelo", "Ano", "Valor_Total", "Condicoes", "Prazo_Entrega", status, vendedor_id, vendedor_nome, criado_em, deleted_at';

export async function lerProposta(id: number): Promise<{ proposta: PropostaResumo; pagamento: unknown | null; semTabelaPagamento: boolean }> {
  const { data, error } = await supabaseAdmin.from('v_formulario').select(COLS_PROPOSTA).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data || (data as { deleted_at?: string | null }).deleted_at) throw new ErroPedido(404, `Proposta #${id} não encontrada (ou na lixeira).`);
  const pg = await supabaseAdmin.from('proposta_pagamento').select('*').eq('proposta_id', id).maybeSingle();
  const semTabela = faltaTabela(pg.error);
  if (pg.error && !semTabela) throw pg.error;
  return { proposta: data as unknown as PropostaResumo, pagamento: pg.data || null, semTabelaPagamento: semTabela };
}

/** Pedidos (não cancelados) já ligados à proposta. */
export async function pedidosDaProposta(propostaId: number) {
  const { data, error } = await supabaseAdmin.from(T.pedidos)
    .select('id, id_pedido, status, pedido_omie, valor_total').eq('proposta_id', propostaId).neq('status', 'cancelado');
  if (faltaTabela(error)) return [];
  if (error) throw error;
  return data || [];
}

export interface OQueImportar { cliente?: boolean; parcelas?: boolean; itens?: boolean }

export async function importarPropostaNoPedido(
  pedidoId: number, propostaId: number, oque: OQueImportar, quem: string,
): Promise<Importacao & { proposta_id: number }> {
  const pedido = await lerPedido(pedidoId);
  exigirEditavel(pedido);
  const outros = (await pedidosDaProposta(propostaId)).filter((p) => p.id !== pedido.id);
  if (outros.length) {
    throw new ErroPedido(409, `A proposta #${propostaId} já está no pedido ${outros.map((o) => o.id_pedido).join(', ')}.`, { outros });
  }
  const { proposta, pagamento } = await lerProposta(propostaId);
  const imp = importarDaProposta(proposta, pagamento, Number(pedido.valor_total) || 0);

  const patch: Record<string, unknown> = { proposta_id: propostaId };
  if (oque.cliente !== false) {
    if (imp.cliente) {
      patch.cliente = imp.cliente.nome;
      if (imp.cliente.documento) { patch.cliente_documento = imp.cliente.documento; patch.cliente_cod_omie = null; }
    }
    if (imp.vendedor_id) patch.vendedor_id = imp.vendedor_id;
  }
  const { error } = await supabaseAdmin.from(T.pedidos).update(patch).eq('id', pedido.id);
  if (error) throw error;

  if (oque.parcelas !== false && imp.parcelas.length) {
    const base = Number(pedido.valor_total) > 0 ? Number(pedido.valor_total) : imp.valor_proposta;
    await gravarParcelas(pedido.id, imp.parcelas, base);
  }
  await log(pedido.id, `Proposta #${propostaId} importada`, quem, {
    cliente: oque.cliente !== false, parcelas: oque.parcelas !== false ? imp.parcelas.length : 0, avisos: imp.avisos,
  });
  return { ...imp, proposta_id: propostaId };
}

export async function desvincularProposta(pedidoId: number, quem: string) {
  const pedido = await lerPedido(pedidoId);
  if (!pedido.proposta_id) return;
  if (pedido.status === 'faturado') throw new ErroPedido(409, 'Pedido faturado: o vínculo com a proposta fica.');
  const { error } = await supabaseAdmin.from(T.pedidos).update({ proposta_id: null }).eq('id', pedido.id);
  if (error) throw error;
  // as parcelas ficam, mas deixam de dizer de onde vieram
  await supabaseAdmin.from(T.parcelas).update({ origem_proposta_parcela: null }).eq('pedido_id', pedido.id);
  await log(pedido.id, `Desvinculado da proposta #${pedido.proposta_id}`, quem);
}
