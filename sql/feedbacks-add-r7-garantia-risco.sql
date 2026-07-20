-- Migration: adiciona a regra R7_garantia_risco (garantia em risco — última
-- revisão feita há 10+ meses; a revisão anual é condição da garantia).
-- Amplia o CHECK constraint da coluna `regra` em feedback_oportunidades e
-- feedback_config_regras pra aceitar 'R7_garantia_risco'. Sem isso o upsert da
-- recomputação falha (viola check) e a regra aparece como ERRO.

ALTER TABLE feedback_oportunidades
  DROP CONSTRAINT IF EXISTS feedback_oportunidades_regra_check;
ALTER TABLE feedback_oportunidades
  ADD CONSTRAINT feedback_oportunidades_regra_check
  CHECK (regra IN ('R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas','R6_fora_garantia','R7_garantia_risco'));

ALTER TABLE feedback_config_regras
  DROP CONSTRAINT IF EXISTS feedback_config_regras_regra_check;
ALTER TABLE feedback_config_regras
  ADD CONSTRAINT feedback_config_regras_regra_check
  CHECK (regra IN ('R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas','R6_fora_garantia','R7_garantia_risco'));

-- Parâmetros default (ajustáveis depois pela própria tabela):
--   meses_aviso  — começa a avisar (default 10)
--   meses_perda  — prazo da revisão anual que derruba a garantia (default 12)
--   garantia_meses_pulverizador — vigência da garantia dos pulverizadores
--     (default 36; ajustar conforme a marca)
--   valor_minimo_pulverizador — item "pulveriz" abaixo disso é PEÇA, não máquina
INSERT INTO feedback_config_regras (regra, parametros) VALUES
  ('R7_garantia_risco', '{"meses_aviso": 10, "meses_perda": 12, "garantia_meses_pulverizador": 36, "valor_minimo_pulverizador": 5000}'::jsonb)
ON CONFLICT (regra) DO NOTHING;
