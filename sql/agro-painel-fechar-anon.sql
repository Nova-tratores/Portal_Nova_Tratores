-- Dashboard Agro: fecha a chave anônima nas tabelas e funções do painel (04/11/2026).
-- Desde 30/10 (commit 7d4ee0b7) a guia Dashboard sai do portal e lê tudo por
-- /api/agro/painel/rest com a service role. O app externo (dashboard-agro-sp) era o
-- único leitor com a anon key (procurado nos repositórios locais em 04/11).
-- Continua a sql/agro-externo-fechar-escrita-anon.sql (que já tirou a escrita).
-- `tratores` fica FORA de propósito: outros apps (TV, mecânicos, CRM) ainda a leem sem login.
-- Logado comum (authenticated) continua lendo, como hoje.
-- Idempotente. Para voltar: GRANT SELECT ON public.<tabela> TO anon;
--                           GRANT EXECUTE ON FUNCTION public.<função> TO anon;

DO $$
DECLARE
  t text;
  f record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'lupa_maquinas','lupa_uso_solo','lupa_tecnologia','lupa_area_cultivada',
    'pecuaria','lavouras_temporarias','lavouras_permanentes',
    'municipio_pontos','municipio_relevo','hidrologia_municipio','temperatura_municipio','renagro_registros'
  ] LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE NOTICE 'tabela % não existe — pulando', t;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    RAISE NOTICE 'anon sem acesso a %', t;
  END LOOP;

  -- o modo "QQ" do app externo gravava a âncora do município sem login
  IF to_regclass('public.municipio_pontos') IS NOT NULL THEN
    DROP POLICY IF EXISTS "anon insert municipio_pontos" ON public.municipio_pontos;
    DROP POLICY IF EXISTS "anon update municipio_pontos" ON public.municipio_pontos;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.municipio_pontos FROM authenticated;
  END IF;

  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('lupa_distinct_maquinas','lupa_maquinas_municipio','lupa_rank_maquina',
                         'distinct_culturas_temp','distinct_culturas_perm','match_cultura_maquina')
  LOOP
    -- função nasce com EXECUTE para PUBLIC (que inclui anon): tira dos dois e devolve a quem precisa
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
    RAISE NOTICE 'anon sem execução de %', f.assinatura;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- PÓS-CHECK (deve dar false em tudo):
--   SELECT t, has_table_privilege('anon', 'public.' || t, 'SELECT') AS anon_le
--     FROM unnest(ARRAY['lupa_maquinas','lupa_uso_solo','pecuaria','lavouras_temporarias','lavouras_permanentes',
--                       'municipio_pontos','municipio_relevo','hidrologia_municipio','temperatura_municipio',
--                       'renagro_registros']) t;
--   SELECT p.oid::regprocedure, has_function_privilege('anon', p.oid, 'EXECUTE')
--     FROM pg_proc p WHERE p.proname IN ('lupa_distinct_maquinas','lupa_rank_maquina','distinct_culturas_temp');
