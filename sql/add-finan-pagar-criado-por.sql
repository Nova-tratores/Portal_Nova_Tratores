-- =============================================================================
-- Quem criou a conta a pagar no portal.
-- Vai pra observação do lançamento no Omie como "Criado por X · Enviado por Y".
-- Registros antigos ficam NULL (sem rastro de criação) — nesse caso a
-- observação cai pra só "Enviado por Y".
-- =============================================================================

ALTER TABLE finan_pagar
  ADD COLUMN IF NOT EXISTS criado_por TEXT;
