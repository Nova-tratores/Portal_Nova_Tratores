-- ROLLBACK de sql/create-feedback-roteiro.sql
-- Apaga os roteiros e a linha 'retorno'; o CHECK volta a R1..R7 (sem 'retorno').
-- Os termômetros gravados em feedback_chamada ficam (colunas são da Fase 1).
DROP TRIGGER IF EXISTS tg_feedback_script_touch ON feedback_script;
DROP FUNCTION IF EXISTS feedback_script_touch();
DROP TABLE IF EXISTS feedback_script;

DELETE FROM feedback_config_regras WHERE regra = 'retorno';
ALTER TABLE feedback_config_regras DROP CONSTRAINT IF EXISTS feedback_config_regras_regra_check;
ALTER TABLE feedback_config_regras
  ADD CONSTRAINT feedback_config_regras_regra_check
  CHECK (regra IN ('R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas','R6_fora_garantia','R7_garantia_risco'));

NOTIFY pgrst, 'reload schema';
