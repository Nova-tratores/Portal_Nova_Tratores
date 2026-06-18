-- Migration: adiciona a regra R6_fora_garantia.
-- Amplia o CHECK constraint da coluna `regra` em feedback_oportunidades e
-- feedback_config_regras pra aceitar 'R6_fora_garantia'. Sem isso o upsert da
-- recomputação falha (viola check) e a regra aparece como ERRO.
-- Rodar no SQL Editor do projeto do Portal (citrhumdkfivdzbmayde).

ALTER TABLE feedback_oportunidades
  DROP CONSTRAINT IF EXISTS feedback_oportunidades_regra_check;
ALTER TABLE feedback_oportunidades
  ADD CONSTRAINT feedback_oportunidades_regra_check
  CHECK (regra IN ('R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas','R6_fora_garantia'));

ALTER TABLE feedback_config_regras
  DROP CONSTRAINT IF EXISTS feedback_config_regras_regra_check;
ALTER TABLE feedback_config_regras
  ADD CONSTRAINT feedback_config_regras_regra_check
  CHECK (regra IN ('R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas','R6_fora_garantia'));
