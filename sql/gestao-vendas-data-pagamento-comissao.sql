-- Gestão de Vendas — data prevista de pagamento da comissão (override por linha).
-- A tela /gestao-vendas/ajustes-venda calcula a data por regra (dia 20 do mês
-- seguinte ao faturamento); esta coluna guarda uma sobrescrita manual quando
-- houver. NULL = usa a regra.
ALTER TABLE comissao_ajustes_vendas
  ADD COLUMN IF NOT EXISTS data_pagamento_comissao_override date;
