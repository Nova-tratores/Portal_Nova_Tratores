-- =============================================================================
-- Migration: adiciona regra R5_pecas em feedback_oportunidades.
-- =============================================================================

-- 1) Ampliar CHECK constraint da coluna regra
ALTER TABLE feedback_oportunidades
  DROP CONSTRAINT IF EXISTS feedback_oportunidades_regra_check;
ALTER TABLE feedback_oportunidades
  ADD CONSTRAINT feedback_oportunidades_regra_check
  CHECK (regra IN ('R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas'));

ALTER TABLE feedback_config_regras
  DROP CONSTRAINT IF EXISTS feedback_config_regras_regra_check;
ALTER TABLE feedback_config_regras
  ADD CONSTRAINT feedback_config_regras_regra_check
  CHECK (regra IN ('R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas'));

-- 2) Parametros default da R5
INSERT INTO feedback_config_regras (regra, parametros) VALUES
  ('R5_pecas', '{"min_meses_sem_pedido":6}'::jsonb)
ON CONFLICT (regra) DO NOTHING;

-- 3) Ajustar parametros do R3 ampliado (agora usa pedidos em vez de tratores.Entrega)
UPDATE feedback_config_regras
SET parametros = '{"min_meses_sem_pedido":12}'::jsonb
WHERE regra = 'R3_upsell';
