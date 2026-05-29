-- =============================================================================
-- Assinatura HTML anexada no fim do corpo do e-mail da SG.
-- Permite cada montadora ter sua própria assinatura (logos, nome, telefone).
-- =============================================================================

ALTER TABLE garantia_montadoras
  ADD COLUMN IF NOT EXISTS email_assinatura TEXT;
