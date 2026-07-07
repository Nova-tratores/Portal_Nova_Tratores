-- =====================================================================
-- P1 (Trilho B) — RLS nas tabelas de garantias
-- =====================================================================
-- Antes: politicas USING(true) (acesso total pela anon key).
-- Agora: leitura so para autenticados (mata leitura anonima). O navegador NAO
-- acessa essas tabelas direto (tudo passa pelas rotas /api/garantias/*, que usam
-- service role e ignoram o RLS), entao nao ha escrita de cliente pra permitir.
--
-- Nao precisa de deploy de codigo junto: as rotas ja usam service role.
-- Idempotente.
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['garantias','garantia_montadoras','garantia_pecas','garantia_pendencias','garantia_anexos']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true);', t||'_select', t);
  END LOOP;
END $$;
