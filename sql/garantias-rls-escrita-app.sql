-- =====================================================================
-- Garantias — devolve a ESCRITA aos usuários logados (app dos mecânicos)
-- =====================================================================
-- O p1-rls-garantias.sql deixou as tabelas SÓ-LEITURA para clientes, com a
-- premissa "tudo passa pelas rotas /api/garantias/*". Verdade pro PORTAL,
-- FALSA pro NT_MECANICOS: o app do técnico escreve DIRETO no Supabase
-- (criarGarantia, responderPendencia, anexos) — é o desenho do módulo
-- ("sem HTTP entre apps"). Consequência real: o técnico respondia o B.O.
-- e o UPDATE afetava 0 linhas SEM ERRO (bug da GAR-0025, 21/07/2026) —
-- só o evento entrava, porque garantia_eventos ficou fora do P1.
--
-- Correção: INSERT/UPDATE para `authenticated` (técnico logado). O objetivo
-- do P1 se mantém: `anon` continua sem acesso nenhum. DELETE continua só via
-- service role (nenhum fluxo do app apaga linhas dessas tabelas).
--
-- Correr no Supabase: SQL Editor -> colar -> Run. Idempotente.
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['garantias','garantia_montadoras','garantia_pecas','garantia_pendencias','garantia_anexos','garantia_eventos']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    -- leitura autenticada (recria por idempotência)
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true);', t||'_select', t);
    -- escrita autenticada (o que o P1 tirou sem querer do app dos mecânicos)
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (true);', t||'_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', t||'_update', t);
    -- garantia_eventos ainda tinha a policy permissiva original — remove
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_all', t);
  END LOOP;
END $$;

-- Conferência:
-- SELECT tablename, policyname, cmd, roles FROM pg_policies
--  WHERE tablename LIKE 'garantia%' ORDER BY tablename, policyname;
