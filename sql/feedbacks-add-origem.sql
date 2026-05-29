-- =============================================================================
-- Migration: rastreia origem dos dados em feedback_registros.
--
-- Cliente atendido via Atender Quick recebe origem baseada no que a regra
-- da oportunidade tinha em maos:
--   - "Omie NOVA"   → dados de pedido_venda ou OS na empresa NOVA
--   - "Omie CASTRO" → dados na empresa CASTRO
--   - "Omie"        → tem codigo_omie mas regra nao tinha empresa identificada
--   - "Portal"      → cliente so existe na tabela tratores (sem codigo_omie)
-- =============================================================================

ALTER TABLE feedback_registros
  ADD COLUMN IF NOT EXISTS origem_dados TEXT;
