-- =============================================================================
-- ONDA 0 de segurança (28/09/2026) — Dashboard Agro EXTERNO
--
-- O app externo (dashboard-agro-sp, no Railway) é público e traz no HTML a chave
-- anônima DESTE banco. O esquema dele criou políticas "Escrita anon" e "Delete
-- anon": qualquer pessoa com a chave insere e APAGA as bases de lavoura,
-- pecuária, relevo, LUPA e RENAGRO.
--
-- O que este arquivo faz:
--   * tira da chave anônima (e do usuário logado comum) inserir, alterar e apagar
--     nessas tabelas;
--   * MANTÉM a leitura, que é o que a tela usa.
-- O que NÃO faz:
--   * não mexe em `municipio_pontos` (o modo "QQ" da tela grava ali sem login —
--     decisão sua, ver o fim do arquivo);
--   * não mexe em `tratores` nem em nenhuma tabela do portal.
--
-- CONSEQUÊNCIA: os scripts de carga (importar_*.py, calcular_relevo.py) usavam a
-- chave anônima para gravar. Depois deste arquivo eles precisam da chave de
-- serviço, na variável de ambiente SUPABASE_SERVICE_KEY. Os scripts já foram
-- ajustados para ler essa variável.
--
-- Idempotente.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- PRÉ-CHECK (só leitura): o que existe hoje
-- ─────────────────────────────────────────────────────────────────────────────
--   SELECT tablename, policyname, cmd, roles
--     FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('lavouras_temporarias','lavouras_permanentes','pecuaria','municipio_relevo',
--                        'lupa_uso_solo','lupa_maquinas','lupa_tecnologia','lupa_area_cultivada',
--                        'renagro_registros','hidrologia_municipio','temperatura_municipio','municipio_pontos')
--    ORDER BY 1, 3;


DO $$
DECLARE
  v_tabelas text[] := ARRAY[
    'lavouras_temporarias', 'lavouras_permanentes', 'pecuaria', 'municipio_relevo',
    'lupa_uso_solo', 'lupa_maquinas', 'lupa_tecnologia', 'lupa_area_cultivada',
    'renagro_registros', 'hidrologia_municipio', 'temperatura_municipio'];
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY v_tabelas LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE NOTICE 'tabela % não existe — pulando', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- derruba toda política que não seja só de leitura
    FOR p IN
      SELECT policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t AND cmd <> 'SELECT'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
      RAISE NOTICE 'política removida: % em %', p.policyname, t;
    END LOOP;

    -- garante que a leitura continua (uma política "ALL" removida acima levaria a leitura junto)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND cmd = 'SELECT') THEN
      EXECUTE format('CREATE POLICY "Leitura pública" ON public.%I FOR SELECT USING (true)', t);
      RAISE NOTICE 'política de leitura criada em %', t;
    END IF;

    -- e tira o privilégio, para não depender só da política
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────────────
-- PÓS-CHECK
-- ─────────────────────────────────────────────────────────────────────────────
--   -- deve devolver só linhas com cmd = 'SELECT' (fora municipio_pontos):
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('lavouras_temporarias','lavouras_permanentes','pecuaria','municipio_relevo',
--                        'lupa_uso_solo','lupa_maquinas','lupa_tecnologia','lupa_area_cultivada',
--                        'renagro_registros','hidrologia_municipio','temperatura_municipio')
--    ORDER BY 1, 3;
--
--   -- deve devolver false em todas:
--   SELECT t, has_table_privilege('anon', 'public.' || t, 'DELETE') AS anon_apaga,
--             has_table_privilege('anon', 'public.' || t, 'INSERT') AS anon_insere
--     FROM unnest(ARRAY['lavouras_temporarias','lavouras_permanentes','pecuaria','municipio_relevo',
--                       'lupa_uso_solo','lupa_maquinas','renagro_registros']) t;


-- ─────────────────────────────────────────────────────────────────────────────
-- DECISÃO PENDENTE — municipio_pontos
-- O modo "QQ" do dashboard (ajuste do ponto de cada município) grava nesta
-- tabela sem login. Fechar aqui desliga esse modo para todos, até o app externo
-- ganhar login. Se quiser fechar mesmo assim, rode:
--
--   DROP POLICY IF EXISTS "anon insert municipio_pontos" ON public.municipio_pontos;
--   DROP POLICY IF EXISTS "anon update municipio_pontos" ON public.municipio_pontos;
--   REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.municipio_pontos FROM anon, authenticated;
-- ─────────────────────────────────────────────────────────────────────────────
