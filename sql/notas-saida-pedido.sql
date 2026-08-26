-- =============================================================
-- Vincula cada NF-e de saída ao PEDIDO de origem (id interno Omie).
-- A NF-e (ListarNF) traz `compl.nIdPedido` = codigo_pedido interno do Omie.
-- Guardamos aqui para o dashboard (/estoque/dashboard) abrir o DANFE da venda:
-- pedido do dashboard -> ConsultarPedido -> idPedido -> n_id_pedido -> nCodNF.
-- Rode no Supabase SQL Editor. Depois, re-sincronize as notas (backfill) para
-- preencher o histórico já espelhado.
-- =============================================================

ALTER TABLE portal_nt_notas_saida
  ADD COLUMN IF NOT EXISTS n_id_pedido BIGINT;

CREATE INDEX IF NOT EXISTS idx_notas_saida_pedido
  ON portal_nt_notas_saida (conta_omie, n_id_pedido);
