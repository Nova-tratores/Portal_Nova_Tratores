-- =============================================================================
-- Prestador autônomo (RPA): não emite nota fiscal nem boleto.
-- Quando TRUE, a validação de envio ao Omie dispensa NF (número + anexo) e boleto.
-- Registros antigos ficam FALSE (fluxo normal, NF/boleto obrigatórios).
-- =============================================================================

ALTER TABLE finan_pagar
  ADD COLUMN IF NOT EXISTS autonomo_sem_nota BOOLEAN NOT NULL DEFAULT FALSE;
