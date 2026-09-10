-- ROLLBACK de sql/feedbacks-add-r8-cadastro.sql
-- Apaga as oportunidades R8, o roteiro R8 e as configs R8/areas; CHECKs voltam a R1..R7 (+ retorno na config).
DELETE FROM feedback_oportunidades WHERE regra = 'R8_cadastro';
DELETE FROM feedback_script WHERE regra = 'R8_cadastro';
DELETE FROM feedback_config_regras WHERE regra IN ('R8_cadastro','areas');

ALTER TABLE feedback_oportunidades DROP CONSTRAINT IF EXISTS feedback_oportunidades_regra_check;
ALTER TABLE feedback_oportunidades
  ADD CONSTRAINT feedback_oportunidades_regra_check
  CHECK (regra IN ('R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas','R6_fora_garantia','R7_garantia_risco'));

ALTER TABLE feedback_config_regras DROP CONSTRAINT IF EXISTS feedback_config_regras_regra_check;
ALTER TABLE feedback_config_regras
  ADD CONSTRAINT feedback_config_regras_regra_check
  CHECK (regra IN ('R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas','R6_fora_garantia','R7_garantia_risco','retorno'));

ALTER TABLE feedback_script DROP CONSTRAINT IF EXISTS feedback_script_regra_check;
ALTER TABLE feedback_script
  ADD CONSTRAINT feedback_script_regra_check
  CHECK (regra IN ('geral','R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas','R6_fora_garantia','R7_garantia_risco'));

NOTIFY pgrst, 'reload schema';
