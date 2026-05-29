-- =============================================================================
-- Migration: campo email em feedback_registros pra contato direto no card.
--
-- Ao atender uma oportunidade, o sistema busca telefone e email do cliente
-- em Clientes (via codigo_omie) e popula no registro pra atendente nao
-- precisar abrir o Omie pra ligar.
-- =============================================================================

ALTER TABLE feedback_registros
  ADD COLUMN IF NOT EXISTS email TEXT;
