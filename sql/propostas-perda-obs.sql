-- =====================================================================
-- Nova Tratores — /propostas: observações do motivo de perda
-- Data: 2026-08-24
--
-- Campo de texto livre para "mais informações" ao marcar uma proposta como
-- "não vendida" (motivo_perda_id/concorrente/concorrente_valor já existem).
-- Formulario já é aberta ao cliente (anon) — sem RLS/grant extra. Idempotente.
-- Rodar ANTES do deploy da app (senão salvar observações falha).
-- =====================================================================

ALTER TABLE "Formulario" ADD COLUMN IF NOT EXISTS motivo_perda_obs text;

-- Verificação:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='Formulario' AND column_name='motivo_perda_obs';
