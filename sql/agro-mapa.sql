-- =============================================================================
-- AGRO — mapa dos imóveis (Fase 4, 25/09/2026)
--
-- 34 mil polígonos do CAR não vão inteiros pro navegador (Piraju sozinho é
-- 5,8 MB em GeoJSON). Duas funções, chamadas pela rota /api/agro/mapa com o
-- service role:
--   agro_mapa_municipios()          → lista dos municípios carregados, com contagens
--   agro_mapa_municipio(ibge, tol)  → FeatureCollection do município: polígonos
--                                     SIMPLIFICADOS (ST_SimplifyPreserveTopology,
--                                     tolerância em graus: 0.00005 ≈ 5 m) + perfil,
--                                     vínculos e sugestões pendentes por imóvel,
--                                     e as visitas do CRM que caem nos imóveis.
-- Só CARs ativos. Idempotente. REVOKE de anon/authenticated.
-- APLICAR À MÃO no SQL Editor.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.agro_mapa_municipios()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'ibge', m.municipio_ibge, 'nome', m.municipio, 'imoveis', m.imoveis,
           'com_perfil', m.com_perfil, 'centro', m.centro) ORDER BY m.municipio), '[]'::jsonb)
    FROM (
      SELECT i.municipio_ibge, min(i.municipio) AS municipio, count(*) AS imoveis,
             count(p.cod_car) AS com_perfil,
             jsonb_build_array(ST_Y(ST_Centroid(ST_Extent(i.geom)::geometry)), ST_X(ST_Centroid(ST_Extent(i.geom)::geometry))) AS centro
        FROM public.agro_car_imovel i
        LEFT JOIN public.agro_car_perfil p ON p.cod_car = i.cod_car
       WHERE i.status_car = 'AT'
       GROUP BY i.municipio_ibge
    ) m;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_mapa_municipios() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.agro_mapa_municipio(p_ibge integer, p_tol double precision DEFAULT 0.00005)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH im AS (
    SELECT i.cod_car, i.municipio, i.area_ha, i.area_util_ha, i.modulos_fiscais, i.condicao,
           ST_SimplifyPreserveTopology(i.geom, p_tol) AS g,
           p.cultura_principal, d.nome AS cultura_nome, d.grupo AS cultura_grupo, p.confianca, p.motivo_confianca,
           p.pct_area_util, p.area_cultura_ha, p.credito_12m, p.credito_36m, p.credito_invest_36m,
           p.ultima_finalidade, p.ultimo_credito_em, p.score_oportunidade,
           (SELECT string_agg(v.cliente_nome, ' · ') FROM public.agro_car_cliente_vinculo v WHERE v.cod_car = i.cod_car) AS clientes,
           (SELECT count(*) FROM public.agro_car_vinculo_sugestao s WHERE s.cod_car = i.cod_car AND s.status = 'pendente') AS sugestoes,
           (SELECT max(GREATEST(s.pct_a, s.pct_b)) FROM public.agro_car_sobreposicao s WHERE s.cod_car_a = i.cod_car OR s.cod_car_b = i.cod_car) AS sobreposicao_pct
      FROM public.agro_car_imovel i
      LEFT JOIN public.agro_car_perfil p ON p.cod_car = i.cod_car
      LEFT JOIN public.agro_dominio_cultura d ON d.codigo = p.cultura_principal
     WHERE i.status_car = 'AT' AND i.municipio_ibge = p_ibge
  ),
  vis AS (
    SELECT DISTINCT ON (v.id) v.id, v.data_visita::date AS dia, v.tipo, v.latitude, v.longitude, v.resumo,
           COALESCE(vd.nome, 'vendedor ' || v.vendedor_id::text) AS vendedor,
           COALESCE(NULLIF(pc.nome_fantasia, ''), NULLIF(pc.razao_social, '')) AS cliente, im.cod_car
      FROM public.visitas v
      JOIN im ON ST_Contains(im.g, ST_SetSRID(ST_MakePoint(v.longitude::double precision, v.latitude::double precision), 4674))
      LEFT JOIN public.vendedores vd ON vd.id = v.vendedor_id
      LEFT JOIN public."portal_nt_clientes_PRINCIPAL" pc ON pc.id = v.propriedade_id
     WHERE v.deleted_at IS NULL AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
  )
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'municipio', (SELECT min(municipio) FROM im),
    'features', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(g, 6)::jsonb,
        'properties', jsonb_build_object(
          'cod_car', cod_car, 'area_ha', area_ha, 'area_util_ha', area_util_ha, 'modulos_fiscais', modulos_fiscais,
          'cultura', cultura_principal, 'cultura_nome', cultura_nome, 'grupo', cultura_grupo,
          'confianca', confianca, 'motivo', motivo_confianca, 'pct', pct_area_util, 'area_cultura_ha', area_cultura_ha,
          'credito_12m', credito_12m, 'credito_36m', credito_36m, 'invest_36m', credito_invest_36m,
          'ultima_finalidade', ultima_finalidade, 'ultimo_credito_em', ultimo_credito_em, 'score', score_oportunidade,
          'clientes', clientes, 'sugestoes', sugestoes, 'sobreposicao_pct', sobreposicao_pct, 'condicao', condicao
        ))) FROM im), '[]'::jsonb),
    'visitas', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'dia', dia, 'tipo', tipo, 'lat', latitude, 'lng', longitude, 'vendedor', vendedor,
        'cliente', cliente, 'cod_car', cod_car, 'resumo', left(resumo, 140))) FROM vis), '[]'::jsonb)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.agro_mapa_municipio(integer, double precision) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- PÓS-CHECK
--   SELECT jsonb_array_length(public.agro_mapa_municipios());                                -- 45
--   SELECT jsonb_array_length(public.agro_mapa_municipio(3538808)->'features');             -- ~863 (Piraju ativos)
--   SELECT pg_column_size(public.agro_mapa_municipio(3538808)) / 1024 AS kb;                -- tamanho da resposta
