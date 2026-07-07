-- P1 (Trilho B) — RLS nas tabelas de clientes (PII). Aplicar DEPOIS do deploy do codigo.
-- Leitura so para autenticados (mata o dump anonimo pela anon key). Escrita pelo
-- cliente bloqueada (as escritas passaram pro servidor, que usa service role).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['portal_nt_clientes_PRINCIPAL','portal_nt_clientes_cadastro_omie','portal_nt_clientes_os','portal_nt_clientes_pv']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true);', t||'_select', t);
  END LOOP;
END $$;
