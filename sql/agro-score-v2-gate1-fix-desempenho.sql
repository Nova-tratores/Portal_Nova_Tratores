-- =============================================================================
-- AGRO — Score v2 · GATE 1 · correção de DESEMPENHO do recálculo por município
--
-- Por quê: na 1ª rodada (execução #16, 28/09/2026) 38 dos 45 municípios fecharam em
-- até 7,5 s, mas 7 estouraram o tempo limite da API (erro 57014): Itaberá, Itaí,
-- Itararé, Palmital, Paranapanema, Santa Cruz do Rio Pardo e Taquarituba.
-- Causa: duas subconsultas por linha sobre o uso do solo (custo quadrático) e a
-- soma de área de TODAS as glebas a cada chamada.
-- O que muda: só a forma da consulta. Regras, parâmetros e resultado são os mesmos.
-- A migration do Gate 1 já aplicada NÃO foi editada; esta recria a função por cima.
-- Idempotente.
--
-- PRÉ-CHECK:
--   SELECT estado, count(*) FROM public.agro_execucao_municipio WHERE execucao_id = 16 GROUP BY 1;  -- ok 38, erro 7
-- =============================================================================

CREATE OR REPLACE FUNCTION public.agro_recalcular_perfil_municipio(p_execucao_id bigint, p_municipio_ibge integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_safra integer;
  v_pp    numeric := public.agro_param_num('cultura_principal_min_pct');
  v_fu    numeric := public.agro_param_num('fonte_unica_min_pct');
  v_sob   numeric := public.agro_param_num('sobreposicao_alta_pct');
  v_dup   numeric := public.agro_param_num('duplicata_mutuo_min_pct');
  v_cont  numeric := public.agro_param_num('contido_min_pct');
  v_jan   integer := public.agro_param_num('sicor_janela_anos_atras')::integer;
  v_teto  text[]  := public.agro_param_lista('culturas_teto_media_satelite');
  v_nao   text[]  := public.agro_param_lista('culturas_nao_principais');
  v_n     integer;
  v_err   text;
BEGIN
  SELECT (parametros ->> 'safra')::integer INTO v_safra FROM public.agro_pipeline_execucao WHERE id = p_execucao_id AND fonte = 'perfil_v2';
  IF v_safra IS NULL THEN RAISE EXCEPTION 'execução % não é de perfil_v2', p_execucao_id; END IF;

  INSERT INTO public.agro_execucao_municipio (execucao_id, municipio_ibge, estado, iniciado_em)
  VALUES (p_execucao_id, p_municipio_ibge, 'pendente', now())
  ON CONFLICT (execucao_id, municipio_ibge) DO UPDATE SET estado = 'pendente', erro = NULL, iniciado_em = now(), concluido_em = NULL, linhas = NULL;

  BEGIN
    DELETE FROM public.agro_perfil_item WHERE execucao_id = p_execucao_id AND municipio_ibge = p_municipio_ibge;

    INSERT INTO public.agro_perfil_item (
      execucao_id, item, grupo_id, n_cars, municipio_ibge, municipio, ano_safra, area_ha, area_util_ha,
      cultura_principal, area_cultura_ha, pct_area_util, mosaico_pct, confianca, motivo_codigo, rebaixadores, motivo_texto,
      fonte_principal, sobreposicao_pct, contido_em, tem_credito, n_operacoes, credito_12m, credito_36m, credito_invest_36m,
      credito_custeio_12m, ultima_finalidade, ultimo_credito_em, tem_vinculo)
    WITH itens AS (            -- representantes de grupo + CARs sozinhos, do município pedido
      SELECT i.cod_car AS item, i.municipio_ibge, i.municipio, i.area_ha, i.area_util_ha, g.id AS grupo_id, COALESCE(g.n_membros, 1) AS n_cars
        FROM public.agro_car_imovel i
        LEFT JOIN public.agro_car_grupo_membro gm ON gm.execucao_id = p_execucao_id AND gm.cod_car = i.cod_car
        LEFT JOIN public.agro_car_grupo g ON g.id = gm.grupo_id
       WHERE i.status_car = 'AT' AND i.municipio_ibge = p_municipio_ibge
         AND (gm.cod_car IS NULL OR g.representante = i.cod_car)
    ),
    mem AS (                   -- todos os CARs de cada item (o próprio, ou os membros do grupo — de qualquer município)
      SELECT it.item, it.item AS cod_car FROM itens it WHERE it.grupo_id IS NULL
      UNION ALL
      SELECT it.item, gm.cod_car FROM itens it JOIN public.agro_car_grupo_membro gm ON gm.grupo_id = it.grupo_id
    ),
    uso AS (                   -- uso do solo: o do REPRESENTANTE
      SELECT u.cod_car AS item, u.cultura_codigo, u.area_ha
        FROM public.agro_uso_solo_car u JOIN itens it ON it.item = u.cod_car
       WHERE u.fonte = 'mapbiomas' AND u.ano_safra = v_safra
    ),
    topo AS (
      SELECT DISTINCT ON (u.item) u.item, u.cultura_codigo, u.area_ha
        FROM uso u WHERE NOT (u.cultura_codigo = ANY (v_nao))
       ORDER BY u.item, u.area_ha DESC, u.cultura_codigo
    ),
    mosaico AS (SELECT item, sum(area_ha) AS area FROM uso WHERE cultura_codigo = 'mosaico' GROUP BY item),
    glebas_item AS (           -- a mesma gleba em dois CARs do grupo conta UMA vez
      SELECT DISTINCT m.item, gc.gleba_id
        FROM mem m JOIN public.agro_sicor_gleba_car gc ON gc.cod_car = m.cod_car
    ),
    ops_item AS (              -- só as operações que tocam este município
      SELECT DISTINCT gl.ref_bacen, gl.nu_ordem
        FROM glebas_item gi JOIN public.agro_sicor_gleba gl ON gl.id = gi.gleba_id
    ),
    op_area AS (
      SELECT g.ref_bacen, g.nu_ordem, sum(COALESCE(g.area_ha, 0)) AS area_total, count(*) AS n
        FROM ops_item oi JOIN public.agro_sicor_gleba g ON g.ref_bacen = oi.ref_bacen AND g.nu_ordem = oi.nu_ordem
       GROUP BY g.ref_bacen, g.nu_ordem
    ),
    cred AS (                  -- uma linha por item × OPERAÇÃO DISTINTA; valor rateado pelas glebas do grupo
      SELECT mem.item, o.ref_bacen, o.nu_ordem, o.dt_emissao, o.finalidade, o.cultura_codigo,
             o.valor * LEAST(CASE WHEN oa.area_total > 0 THEN sum(COALESCE(gl.area_ha, 0)) / oa.area_total
                                  ELSE count(*)::numeric / GREATEST(oa.n, 1) END, 1) AS valor_rateado
        FROM glebas_item mem
        JOIN public.agro_sicor_gleba gl ON gl.id = mem.gleba_id
        JOIN public.agro_sicor_operacao o ON o.ref_bacen = gl.ref_bacen AND o.nu_ordem = gl.nu_ordem
        JOIN op_area oa ON oa.ref_bacen = o.ref_bacen AND oa.nu_ordem = o.nu_ordem
       GROUP BY mem.item, o.ref_bacen, o.nu_ordem, o.dt_emissao, o.finalidade, o.cultura_codigo, o.valor, oa.area_total, oa.n
    ),
    cred_tot AS (
      SELECT item, count(*)::integer AS n_ops, max(dt_emissao) AS ultimo,
             COALESCE(sum(valor_rateado) FILTER (WHERE dt_emissao >= current_date - 365), 0)  AS c12,
             COALESCE(sum(valor_rateado) FILTER (WHERE dt_emissao >= current_date - 1095), 0) AS c36,
             COALESCE(sum(valor_rateado) FILTER (WHERE dt_emissao >= current_date - 1095 AND lower(COALESCE(finalidade, '')) LIKE 'invest%'), 0) AS ci36,
             COALESCE(sum(valor_rateado) FILTER (WHERE dt_emissao >= current_date - 365  AND lower(COALESCE(finalidade, '')) LIKE 'custeio%'), 0) AS cc12
        FROM cred GROUP BY item
    ),
    cred_ult AS (SELECT DISTINCT ON (item) item, finalidade FROM cred ORDER BY item, dt_emissao DESC, ref_bacen DESC),
    sicor_cult AS (
      SELECT DISTINCT ON (x.item) x.item, x.cultura_codigo
        FROM (SELECT item, cultura_codigo, sum(valor_rateado) AS v FROM cred
               WHERE cultura_codigo IS NOT NULL
                 AND extract(year FROM dt_emissao)::integer BETWEEN v_safra - v_jan AND v_safra + 1
               GROUP BY item, cultura_codigo) x
       ORDER BY x.item, x.v DESC, x.cultura_codigo
    ),
    valid AS (                 -- validação de campo: a mais recente em qualquer CAR do grupo
      SELECT DISTINCT ON (mem.item) mem.item, v.cultura_real, v.informado_por, v.informado_em
        FROM mem JOIN public.agro_car_validacao v ON v.cod_car = mem.cod_car
       ORDER BY mem.item, v.informado_em DESC
    ),
    par AS (                   -- pares de sobreposição do representante, vistos do lado dele
      SELECT it.item, s.cod_car_b AS outro, s.pct_a AS meu, s.pct_b AS dele, s.area_sobreposta_ha AS ar
        FROM itens it JOIN public.agro_car_sobreposicao s ON s.cod_car_a = it.item
      UNION ALL
      SELECT it.item, s.cod_car_a, s.pct_b, s.pct_a, s.area_sobreposta_ha
        FROM itens it JOIN public.agro_car_sobreposicao s ON s.cod_car_b = it.item
    ),
    par_fora AS (              -- fora do próprio grupo e só com CAR ativo
      SELECT p.* FROM par p
        JOIN public.agro_car_imovel io ON io.cod_car = p.outro AND io.status_car = 'AT'
        LEFT JOIN mem m ON m.item = p.item AND m.cod_car = p.outro
       WHERE m.item IS NULL
    ),
    sob AS (SELECT item, max(meu) AS pct FROM par_fora GROUP BY item),
    contido AS (
      SELECT DISTINCT ON (item) item, outro FROM par_fora WHERE meu >= v_cont AND dele < v_dup ORDER BY item, ar DESC, outro
    ),
    vinc AS (SELECT DISTINCT mem.item FROM mem JOIN public.agro_car_cliente_vinculo v ON v.cod_car = mem.cod_car),
    base AS (
      SELECT it.*,
             CASE WHEN it.area_util_ha > 0 AND t.area_ha / it.area_util_ha * 100 >= v_pp THEN t.cultura_codigo END AS sat_cult,
             t.area_ha AS sat_area,
             CASE WHEN it.area_util_ha > 0 THEN LEAST(t.area_ha / it.area_util_ha * 100, 100) END AS sat_pct,
             CASE WHEN it.area_util_ha > 0 THEN LEAST(COALESCE(mo.area, 0) / it.area_util_ha * 100, 100) END AS mosaico_pct,
             sc.cultura_codigo AS sicor_cult,
             va.cultura_real, va.informado_por, va.informado_em,
             COALESCE(sb.pct, 0) AS sob_pct, ct.outro AS contido_em,
             ctt.n_ops, ctt.ultimo, ctt.c12, ctt.c36, ctt.ci36, ctt.cc12, cu.finalidade AS ult_fin,
             (vi.item IS NOT NULL) AS tem_vinculo
        FROM itens it
        LEFT JOIN topo t        ON t.item = it.item
        LEFT JOIN mosaico mo    ON mo.item = it.item
        LEFT JOIN sicor_cult sc ON sc.item = it.item
        LEFT JOIN valid va      ON va.item = it.item
        LEFT JOIN sob sb        ON sb.item = it.item
        LEFT JOIN contido ct    ON ct.item = it.item
        LEFT JOIN cred_tot ctt  ON ctt.item = it.item
        LEFT JOIN cred_ult cu   ON cu.item = it.item
        LEFT JOIN vinc vi       ON vi.item = it.item
    ),
    mot AS (                   -- motivo PRINCIPAL, na precedência da Decisão 3
      SELECT b.*,
             CASE
               WHEN b.cultura_real IS NOT NULL                                   THEN 'validado_campo'
               WHEN b.sat_cult IS NOT NULL AND b.sicor_cult = b.sat_cult          THEN 'fontes_concordam'
               WHEN b.sat_cult IS NOT NULL AND b.sicor_cult IS NOT NULL           THEN 'fontes_discordam'
               WHEN b.sat_cult IS NOT NULL AND b.sat_pct >= v_fu AND b.sat_cult = ANY (v_teto) THEN 'cafe_cana_satelite'
               WHEN b.sat_cult IS NOT NULL AND b.sat_pct >= v_fu                  THEN 'fonte_unica_60'
               WHEN b.sat_cult IS NOT NULL                                        THEN 'fonte_unica_abaixo_60'
               WHEN b.sicor_cult IS NOT NULL                                      THEN 'fonte_unica_credito'
               ELSE 'diversificado'
             END AS motivo_codigo,
             CASE WHEN b.sob_pct > v_sob THEN ARRAY['sobreposicao_alta'] ELSE ARRAY[]::text[] END AS rebaixadores
        FROM base b
    ),
    conf AS (
      SELECT m.*,
             CASE m.motivo_codigo
               WHEN 'validado_campo'        THEN 'alta'
               WHEN 'fontes_concordam'      THEN 'alta'
               WHEN 'fontes_discordam'      THEN 'baixa'
               WHEN 'fonte_unica_abaixo_60' THEN 'baixa'
               WHEN 'diversificado'         THEN 'baixa'   -- a lógica do v1 não muda (Decisão 3); quem o traz pra lista é o FILTRO
               ELSE 'media'                 -- fonte_unica_60, cafe_cana_satelite, fonte_unica_credito
             END AS conf_base,
             CASE m.motivo_codigo
               WHEN 'validado_campo'      THEN m.cultura_real
               WHEN 'fonte_unica_credito' THEN m.sicor_cult
               WHEN 'diversificado'       THEN NULL
               ELSE m.sat_cult
             END AS cultura
        FROM mot m
    )
    SELECT p_execucao_id, c.item, c.grupo_id, c.n_cars, c.municipio_ibge, c.municipio, v_safra, c.area_ha, c.area_util_ha,
           c.cultura,
           uc.area_ha,
           round(LEAST(uc.area_ha / NULLIF(c.area_util_ha, 0) * 100, 100)::numeric, 2),
           round(c.mosaico_pct::numeric, 2),
           -- confiança alta não é rebaixada por sobreposição (regra do v1, mantida)
           CASE WHEN c.conf_base = 'alta' THEN 'alta' WHEN cardinality(c.rebaixadores) > 0 THEN 'baixa' ELSE c.conf_base END,
           c.motivo_codigo, c.rebaixadores,
           (CASE c.motivo_codigo
              WHEN 'validado_campo'        THEN 'Validado em campo por ' || c.informado_por || ' em ' || to_char(c.informado_em, 'DD/MM/YYYY')
              WHEN 'fontes_concordam'      THEN 'Satélite (' || round(c.sat_pct) || '% da área útil) e crédito rural apontam a mesma cultura'
              WHEN 'fontes_discordam'      THEN 'Satélite aponta ' || c.sat_cult || ' (' || round(c.sat_pct) || '%) e o crédito rural aponta ' || c.sicor_cult
              WHEN 'cafe_cana_satelite'    THEN 'Só satélite (' || round(c.sat_pct) || '% da área útil); café e cana pedem crédito ou validação para confiança alta'
              WHEN 'fonte_unica_60'        THEN 'Só satélite: a cultura ocupa ' || round(c.sat_pct) || '% da área útil'
              WHEN 'fonte_unica_abaixo_60' THEN 'Só satélite e a cultura ocupa apenas ' || round(c.sat_pct) || '% da área útil'
              WHEN 'fonte_unica_credito'   THEN 'Satélite mostra uso misto; a cultura vem só do crédito rural'
              ELSE 'Diversificado: nenhuma cultura chega a ' || round(v_pp) || '% da área útil'
                   || COALESCE(' (mosaico de usos ' || round(c.mosaico_pct) || '%)', '')
            END)
           || CASE WHEN cardinality(c.rebaixadores) > 0 THEN '; ' || round(c.sob_pct) || '% sobreposto a outro CAR' ELSE '' END
           || CASE WHEN c.contido_em IS NOT NULL THEN '; contido em ' || c.contido_em ELSE '' END,
           CASE c.motivo_codigo WHEN 'validado_campo' THEN 'campo' WHEN 'fonte_unica_credito' THEN 'sicor' ELSE 'mapbiomas' END,
           round(c.sob_pct::numeric, 2), c.contido_em,
           (c.n_ops IS NOT NULL), COALESCE(c.n_ops, 0),
           round(COALESCE(c.c12, 0)::numeric, 2), round(COALESCE(c.c36, 0)::numeric, 2),
           round(COALESCE(c.ci36, 0)::numeric, 2), round(COALESCE(c.cc12, 0)::numeric, 2),
           c.ult_fin, c.ultimo, c.tem_vinculo
      FROM conf c
      LEFT JOIN uso uc ON uc.item = c.item AND uc.cultura_codigo = c.cultura;   -- junção, não subconsulta por linha
    GET DIAGNOSTICS v_n = ROW_COUNT;

    UPDATE public.agro_execucao_municipio SET estado = 'ok', linhas = v_n, concluido_em = now()
     WHERE execucao_id = p_execucao_id AND municipio_ibge = p_municipio_ibge;
    RETURN v_n;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    UPDATE public.agro_execucao_municipio SET estado = 'erro', erro = left(v_err, 500), concluido_em = now()
     WHERE execucao_id = p_execucao_id AND municipio_ibge = p_municipio_ibge;
    RETURN -1;
  END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_recalcular_perfil_municipio(bigint, integer) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Refaz AQUI (o SQL Editor não tem o tempo limite da API) só os municípios que
-- não concluíram na execução #16. Devolve o nº de itens; -1 = erro.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT m.municipio_ibge, public.agro_recalcular_perfil_municipio(m.execucao_id, m.municipio_ibge) AS itens
  FROM public.agro_execucao_municipio m
 WHERE m.execucao_id = 16 AND m.estado <> 'ok'
 ORDER BY m.municipio_ibge;

-- PÓS-CHECK:
--   SELECT estado, count(*) FROM public.agro_execucao_municipio WHERE execucao_id = 16 GROUP BY 1;  -- ok 45
