-- ============================================================================
-- RASTREIO DE NOTAS — 19/08/2026
-- Ids das requisições que geraram a conta a pagar. Hoje esse vínculo só
-- existe como texto ("#id título" dentro de finan_pagar.motivo) e se perde.
-- A tela novo-pagar-receber passa a gravar aqui; linhas antigas continuam
-- resolvidas pelo parse do motivo na hora da busca (sem backfill).
-- Idempotente. Rodar no SQL Editor do Supabase.
-- ============================================================================

ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "requisicao_ids" JSONB; -- ex.: [123, 124]

NOTIFY pgrst, 'reload schema';
