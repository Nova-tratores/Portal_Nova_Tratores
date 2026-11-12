-- ============================================================================
-- Recebimentos: a aba "Entradas feitas" passa a registrar também as REVERSÕES
-- (botão Reabrir = ReverterRecebimento na Omie). Libera a ação 'reversao' no
-- CHECK de recebimento_entrada_log. Idempotente. Rodar no SQL Editor.
-- Sem ela: a reversão continua funcionando e fica no audit_log; só não aparece
-- na aba "Entradas feitas".
-- ============================================================================
ALTER TABLE recebimento_entrada_log DROP CONSTRAINT IF EXISTS recebimento_entrada_log_acao_check;
ALTER TABLE recebimento_entrada_log
  ADD CONSTRAINT recebimento_entrada_log_acao_check
  CHECK (acao IN ('dar_entrada', 'correcao_cmc', 'reversao'));
