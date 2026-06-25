-- =============================================================================
-- Vínculo Orçamento -> Ordem de Serviço.
-- Permite anexar um orçamento (módulo Orçamentos) a uma OS no POS, exibir o
-- conteúdo do orçamento na OS e importar peças/horas/km/observação.
-- Uma OS pode ter vários orçamentos (cada orçamento aponta para uma OS).
-- O status do orçamento é texto livre; ao importar/aprovar pela OS vira 'aprovado'.
-- =============================================================================

ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS ordem_servico TEXT;

CREATE INDEX IF NOT EXISTS idx_orcamentos_ordem_servico ON orcamentos(ordem_servico);
