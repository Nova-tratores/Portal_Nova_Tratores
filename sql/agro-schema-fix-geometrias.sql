-- =============================================================================
-- AGRO — correção de geometrias inválidas (patch, 25/09/2026)
--
-- Achado na carga dos 40 municípios da NOVA: o SICAR entrega polígonos
-- inválidos (auto-interseção) e o ST_Intersection de agro_calcular_sobreposicoes
-- caiu com "GEOS TopologyException: side location conflict" em Arandu.
--
-- 1) agro_corrigir_geometrias(): conserta o que já está gravado (ST_MakeValid,
--    mantendo só a parte poligonal e o tipo Multi). Idempotente.
-- 2) As duas funções de cruzamento passam a usar ST_MakeValid por garantia.
--
-- APLICAR À MÃO no SQL Editor do Supabase. Depois rodar:
--   SELECT public.agro_corrigir_geometrias();
-- (o mesmo bloco foi incorporado em sql/agro-schema.sql para instalações novas)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.agro_corrigir_geometrias()
RETURNS TABLE (tabela text, corrigidas integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_car integer; v_gleba integer;
BEGIN
  UPDATE public.agro_car_imovel
     SET geom = ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3))
   WHERE NOT ST_IsValid(geom);
  GET DIAGNOSTICS v_car = ROW_COUNT;

  UPDATE public.agro_sicor_gleba
     SET geom = ST_GeometryN(ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3)), 1)   -- gleba é Polygon simples: fica a 1ª parte (ST_Dump não pode em UPDATE)
   WHERE geom IS NOT NULL AND NOT ST_IsValid(geom);
  GET DIAGNOSTICS v_gleba = ROW_COUNT;

  RETURN QUERY SELECT 'agro_car_imovel'::text, v_car UNION ALL SELECT 'agro_sicor_gleba'::text, v_gleba;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_corrigir_geometrias() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.agro_atribuir_glebas(p_execucao_id bigint, p_minimo numeric DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_n integer;
BEGIN
  DELETE FROM public.agro_sicor_gleba_car WHERE execucao_id = p_execucao_id AND metodo = 'intersecao_50';

  INSERT INTO public.agro_sicor_gleba_car (gleba_id, cod_car, pct_gleba_no_car, metodo, execucao_id)
  SELECT DISTINCT ON (g.id)
         g.id, c.cod_car,
         round((ST_Area(ST_Intersection(ST_MakeValid(g.geom), ST_MakeValid(c.geom))::geography) / NULLIF(ST_Area(g.geom::geography), 0) * 100)::numeric, 2),
         'intersecao_50', p_execucao_id
    FROM public.agro_sicor_gleba g
    JOIN public.agro_car_imovel c
      ON c.status_car = 'AT' AND c.geom && g.geom AND ST_Intersects(c.geom, g.geom)
   WHERE g.geom IS NOT NULL
     AND ST_Area(ST_Intersection(ST_MakeValid(g.geom), ST_MakeValid(c.geom))::geography) / NULLIF(ST_Area(g.geom::geography), 0) * 100 >= p_minimo
   ORDER BY g.id, ST_Area(ST_Intersection(ST_MakeValid(g.geom), ST_MakeValid(c.geom))::geography) DESC
  ON CONFLICT (gleba_id, cod_car) DO UPDATE
     SET pct_gleba_no_car = EXCLUDED.pct_gleba_no_car, execucao_id = EXCLUDED.execucao_id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.agro_calcular_sobreposicoes(p_execucao_id bigint, p_municipio_ibge integer DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_n integer;
BEGIN
  DELETE FROM public.agro_car_sobreposicao s
   USING public.agro_car_imovel a
   WHERE s.cod_car_a = a.cod_car AND (p_municipio_ibge IS NULL OR a.municipio_ibge = p_municipio_ibge);

  INSERT INTO public.agro_car_sobreposicao (cod_car_a, cod_car_b, area_sobreposta_ha, pct_a, pct_b, execucao_id)
  SELECT a.cod_car, b.cod_car,
         round((ST_Area(ST_Intersection(ST_MakeValid(a.geom), ST_MakeValid(b.geom))::geography) / 10000)::numeric, 4),
         round((ST_Area(ST_Intersection(ST_MakeValid(a.geom), ST_MakeValid(b.geom))::geography) / NULLIF(ST_Area(a.geom::geography), 0) * 100)::numeric, 2),
         round((ST_Area(ST_Intersection(ST_MakeValid(a.geom), ST_MakeValid(b.geom))::geography) / NULLIF(ST_Area(b.geom::geography), 0) * 100)::numeric, 2),
         p_execucao_id
    FROM public.agro_car_imovel a
    JOIN public.agro_car_imovel b
      ON b.cod_car > a.cod_car AND b.status_car = 'AT' AND b.municipio_ibge = a.municipio_ibge
     AND a.geom && b.geom AND ST_Intersects(a.geom, b.geom)
   WHERE a.status_car = 'AT'
     AND (p_municipio_ibge IS NULL OR a.municipio_ibge = p_municipio_ibge)
     AND ST_Area(ST_Intersection(ST_MakeValid(a.geom), ST_MakeValid(b.geom))::geography) > 100;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- 3) Área útil em SQL, de uma vez, em vez de um PATCH por imóvel (28 mil PATCHes
--    em paralelo saturaram o Supabase). area_util = soma das culturas de USO
--    (todas as que têm classe MapBiomas no vocabulário) na safra mais recente.
CREATE OR REPLACE FUNCTION public.agro_recalcular_area_util(p_ano_safra integer DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ano integer; v_n integer;
BEGIN
  v_ano := COALESCE(p_ano_safra, (SELECT max(ano_safra) FROM public.agro_uso_solo_car WHERE fonte = 'mapbiomas'));
  UPDATE public.agro_car_imovel i
     SET area_util_ha = s.area_util
    FROM (SELECT u.cod_car, sum(u.area_ha) AS area_util
            FROM public.agro_uso_solo_car u
            JOIN public.agro_dominio_cultura d ON d.codigo = u.cultura_codigo
           WHERE u.fonte = 'mapbiomas' AND u.ano_safra = v_ano
             AND cardinality(d.mapbiomas_classes) > 0
           GROUP BY u.cod_car) s
   WHERE s.cod_car = i.cod_car
     AND (i.area_util_ha IS NULL OR i.area_util_ha <> s.area_util);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_recalcular_area_util(integer) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- Depois de aplicar:
--   SELECT * FROM public.agro_corrigir_geometrias();
--   SELECT public.agro_recalcular_area_util();      -- devolve quantos imóveis atualizou
