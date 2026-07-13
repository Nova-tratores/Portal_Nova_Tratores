-- =============================================================================
-- Coluna `origem` em Requisicao — usada pelo registro AUTOMÁTICO de despesa
-- de alimentação ao fechar a OS (src/lib/pos/alimentacao-os.ts).
--
-- O código sempre assumiu essa coluna ('auto_alimentacao_os'), mas ela nunca
-- foi criada: o insert automático falhava silenciosamente ("Could not find
-- the 'origem' column") e NENHUMA alimentação automática foi registrada até
-- 13/07/2026. Ela também é a chave da idempotência (não duplicar ao
-- reconcluir) e da distinção manual x automática.
--
-- APLICAR NO SUPABASE (SQL Editor) — sem ela o fluxo continua falhando
-- silenciosamente como sempre falhou.
-- =============================================================================

ALTER TABLE "Requisicao"
  ADD COLUMN IF NOT EXISTS origem TEXT;

COMMENT ON COLUMN "Requisicao".origem IS
  'De onde a requisição veio. NULL = criada manualmente; auto_alimentacao_os = gerada ao fechar a OS.';
