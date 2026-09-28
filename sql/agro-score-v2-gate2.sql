-- =============================================================================
-- AGRO — Score v2 · GATE 2: duas listas (Conquista × Base instalada)
-- Prompt-file "Score v2 e correções de base (1.1 a 1.6)" + Decisões após o Gate 0.
-- Depende de: sql/agro-score-v2-gate1.sql e -fix-desempenho.sql (APLICADAS).
--
-- PRINCÍPIOS
--  * O v1 não é tocado (agro_car_perfil.score_oportunidade). O v2 mora em
--    agro_score_item, com score_versao = 2, por execução numerada.
--  * O score lê o PERFIL PUBLICADO (agro_publicacao 'perfil_v2') e é calculado
--    sobre o item (grupo de duplicatas ou CAR avulso).
--  * Todo peso e limite é parâmetro (agro_parametro), com histórico.
--  * Um município por chamada; percentis só na publicação, com os 45 'ok'.
--  * A tela continua no v1 até o Gate 3 (parâmetro score_versao_padrao = 1).
--  * Nenhum dado fictício: com 0 vínculos, a lista Base instalada sai vazia.
--  * Idempotente. Nenhuma migration antiga foi editada.
--
-- PRÉ-CHECKS (só leitura)
--   SELECT * FROM public.agro_publicacao;                         -- perfil_v2 → execução 16
--   SELECT count(*) FROM public.agro_perfil_item WHERE execucao_id = 16;   -- 31316
--   SELECT count(*) FROM public.agro_parametro;                   -- 9
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Execução e publicação aceitam o tipo novo
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.agro_pipeline_execucao DROP CONSTRAINT IF EXISTS agro_pipeline_execucao_fonte_check;
ALTER TABLE public.agro_pipeline_execucao
  ADD CONSTRAINT agro_pipeline_execucao_fonte_check
  CHECK (fonte IN ('sicar','mapbiomas','sicor','ibge_pam','sentinel','perfil','crm','sobreposicao','perfil_v2','score_v2'));

ALTER TABLE public.agro_publicacao DROP CONSTRAINT IF EXISTS agro_publicacao_tipo_check;
ALTER TABLE public.agro_publicacao
  ADD CONSTRAINT agro_publicacao_tipo_check CHECK (tipo IN ('perfil_v2', 'score_v2'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Parâmetros do score (padrão inicial do prompt; o comercial revisa)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.agro_parametro (chave, valor, grupo, descricao, atualizado_por) VALUES
  ('score_versao_padrao', '1', 'score',
   'Versão do score que a tela usa por padrão (1 ou 2). A troca é feita aqui.', 'migration gate 2'),
  ('score_area_curva', '{"zero_ate":5,"sobe_ate":20,"plato_ate":300,"desce_ate":1000,"piso":0.25}', 'score',
   'Curva de aderência sobre a ÁREA ÚTIL (ha): abaixo de zero_ate = 0; sobe até o máximo em sobe_ate; máximo até plato_ate; desce até desce_ate; acima disso vale o piso (fração do máximo).', 'migration gate 2'),
  ('score_conquista_pesos', '{"area":4,"cultura":2,"prioridade":2}', 'score',
   'Pontos máximos de cada parcela do score de Conquista. A soma é normalizada para 0 a 10.', 'migration gate 2'),
  ('score_cultura_peso', '{"pastagem":2,"cafe":2,"citros":2,"diversificado":2,"cana":1.5,"soja":1,"silvicultura":0.5,"outras":1}', 'score',
   'Pontos do perfil de cultura (máximo = peso "cultura"). Cultura fora da lista usa "outras".', 'migration gate 2'),
  ('score_prioridade', '{"min":0.4,"max":2,"sem_regra":1,"niveis":5}', 'score',
   'Prioridade da regra comercial: 1 (mais importante) vale "max", o último nível vale "min"; sem regra vale "sem_regra".', 'migration gate 2'),
  ('score_bonus_credito', '{"invest_36m":1,"custeio_12m":0.5,"teto":1.5}', 'score',
   'Bônus de crédito, FORA do score base: investimento em 36 meses, custeio em 12 meses e teto.', 'migration gate 2'),
  ('score_base_pesos', '{"area":3,"crescimento":2,"trator":3,"implemento":2}', 'score',
   'Pontos máximos de cada parcela do score da Base instalada. Parcela sem dado sai da soma.', 'migration gate 2'),
  ('score_base_crescimento', '{"ano_inicial":2022,"nivel1_pct":10,"pontos1":1,"nivel2_pct":25,"pontos2":2}', 'score',
   'Crescimento da área útil entre ano_inicial e a safra do perfil.', 'migration gate 2'),
  ('score_base_trator_idade', '{"anos_velho":6,"pontos_velho":3,"anos_meio":4,"pontos_meio":1.5}', 'score',
   'Idade do trator mais novo vendido ao cliente: a partir de anos_velho vale pontos_velho; a partir de anos_meio vale pontos_meio; abaixo disso, 0.', 'migration gate 2'),
  ('familias_trator', '["trator"]', 'base_instalada',
   'Trechos do nome da família do produto que indicam TRATOR (sem acento, minúsculas).', 'migration gate 2'),
  ('familias_implemento', '["implemento","carreta","pulverizador","plantadeira","adubadora","colhe","rocadeira","grade","distribuidor","conjunto frontal","trincha","subsolador","vagao","vagoes","forrageira","autopropelido"]', 'base_instalada',
   'Trechos do nome da família do produto que indicam IMPLEMENTO (sem acento, minúsculas).', 'migration gate 2'),
  ('trator_cidade_por_prefixo', 'false', 'base_instalada',
   'Ligação do trator por nome: false = município IGUAL (Decisão 5); true = aceita o município no começo do texto ("AGUDOS FAZ SÃO DOMINGOS").', 'migration gate 2')
ON CONFLICT (chave) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Funções puras de apoio
-- ─────────────────────────────────────────────────────────────────────────────
-- nome/município comparável: maiúsculas, sem acento, sem pontuação, sem "(SP)"
CREATE OR REPLACE FUNCTION public.agro_norm(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(btrim(regexp_replace(regexp_replace(
           translate(upper(regexp_replace(COALESCE(p, ''), '\([^)]*\)', ' ', 'g')),
                     'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'),
           '[^A-Z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')), '');
$$;

-- data em texto ('dd/mm/aaaa' ou 'aaaa-mm-dd') → date; qualquer outra coisa → NULL
CREATE OR REPLACE FUNCTION public.agro_data_texto(p text)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF p ~ '^\d{2}/\d{2}/\d{4}$' THEN RETURN to_date(p, 'DD/MM/YYYY');
  ELSIF p ~ '^\d{4}-\d{2}-\d{2}' THEN RETURN to_date(left(p, 10), 'YYYY-MM-DD');
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- aderência de área: devolve a FRAÇÃO (0 a 1) do máximo da parcela
CREATE OR REPLACE FUNCTION public.agro_score_area(p_area_util numeric, p_curva jsonb)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_area_util IS NULL THEN NULL
    WHEN p_area_util <  (p_curva ->> 'zero_ate')::numeric THEN 0
    WHEN p_area_util <  (p_curva ->> 'sobe_ate')::numeric THEN
         (p_area_util - (p_curva ->> 'zero_ate')::numeric)
         / NULLIF((p_curva ->> 'sobe_ate')::numeric - (p_curva ->> 'zero_ate')::numeric, 0)
    WHEN p_area_util <= (p_curva ->> 'plato_ate')::numeric THEN 1
    WHEN p_area_util <  (p_curva ->> 'desce_ate')::numeric THEN
         1 - (1 - (p_curva ->> 'piso')::numeric)
             * (p_area_util - (p_curva ->> 'plato_ate')::numeric)
             / NULLIF((p_curva ->> 'desce_ate')::numeric - (p_curva ->> 'plato_ate')::numeric, 0)
    ELSE (p_curva ->> 'piso')::numeric
  END;
$$;

-- a família do produto contém algum dos trechos?
CREATE OR REPLACE FUNCTION public.agro_familia_e(p_familia text, p_trechos text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM unnest(p_trechos) t WHERE lower(public.agro_norm(p_familia)) LIKE '%' || t || '%');
$$;
REVOKE EXECUTE ON FUNCTION public.agro_norm(text), public.agro_data_texto(text),
  public.agro_score_area(numeric, jsonb), public.agro_familia_e(text, text[]) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Tabelas do score
-- ─────────────────────────────────────────────────────────────────────────────
-- O que a Nova vendeu para cada cliente VINCULADO (só quem tem vínculo entra).
-- O cadastro tem o mesmo cliente duas vezes (contas NOVA e CASTRO, mesmo CPF/CNPJ
-- e id_omie diferente): a identidade aqui é o DOCUMENTO.
CREATE TABLE IF NOT EXISTS public.agro_cliente_maquina (
  execucao_id       bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id) ON DELETE CASCADE,
  cliente_omie_id   text NOT NULL,                 -- o do vínculo
  documento         text,                          -- só dígitos; NULL = cliente sem documento no cadastro
  trator_mais_novo_em date,
  trator_origem     text CHECK (trator_origem IN ('venda_codigo', 'revisoes_nome')),
  n_tratores_venda  integer NOT NULL DEFAULT 0,    -- vendas_itens, por código (desde 2022)
  n_tratores_nome   integer NOT NULL DEFAULT 0,    -- controle de revisões, por nome + município
  tem_implemento    boolean,                       -- NULL = cliente não localizado no cadastro
  implemento_ultimo_em date,
  PRIMARY KEY (execucao_id, cliente_omie_id)
);
ALTER TABLE public.agro_cliente_maquina ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.agro_score_item (
  execucao_id        bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id) ON DELETE CASCADE,
  perfil_execucao_id bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id),
  item               text NOT NULL REFERENCES public.agro_car_imovel(cod_car) ON DELETE CASCADE,
  score_versao       integer NOT NULL DEFAULT 2,
  lista              text NOT NULL CHECK (lista IN ('conquista', 'base')),
  municipio_ibge     integer NOT NULL,
  -- parcelas em PONTOS; NULL = sem dado (fica fora da soma)
  p_area             numeric(5,2),
  p_cultura          numeric(5,2),
  p_prioridade       numeric(5,2),
  p_crescimento      numeric(5,2),
  p_trator           numeric(5,2),
  p_implemento       numeric(5,2),
  soma               numeric(6,2) NOT NULL DEFAULT 0,
  soma_max           numeric(6,2) NOT NULL DEFAULT 0,   -- máximo possível com as parcelas PRESENTES
  fator_confianca    numeric(4,2) NOT NULL,
  score_base         numeric(5,2) NOT NULL DEFAULT 0,   -- 0 a 10, já com o fator de confiança
  bonus_credito      numeric(4,2),                      -- NULL = sem crédito localizável (não é zero)
  score_com_bonus    numeric(5,2) NOT NULL DEFAULT 0,
  percentil          numeric(5,2),                      -- dentro da lista; preenchido na publicação
  regra_id           bigint,
  ausentes           text[] NOT NULL DEFAULT '{}',      -- parcelas sem dado, pra ficha dizer
  detalhe            jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculado_em       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (execucao_id, item)
);
CREATE INDEX IF NOT EXISTS agro_score_item_lista_idx ON public.agro_score_item (execucao_id, lista, score_base DESC);
CREATE INDEX IF NOT EXISTS agro_score_item_mun_idx   ON public.agro_score_item (execucao_id, municipio_ibge);
ALTER TABLE public.agro_score_item ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Máquinas dos clientes vinculados (etapa global, roda ao abrir a execução)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agro_calcular_cliente_maquina(p_execucao_id bigint)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trat  text[]  := public.agro_param_lista('familias_trator');
  v_impl  text[]  := public.agro_param_lista('familias_implemento');
  v_pref  boolean := COALESCE((public.agro_param('trator_cidade_por_prefixo') #>> '{}')::boolean, false);
  v_n     integer;
BEGIN
  DELETE FROM public.agro_cliente_maquina WHERE execucao_id = p_execucao_id;

  INSERT INTO public.agro_cliente_maquina (execucao_id, cliente_omie_id, documento, trator_mais_novo_em, trator_origem,
                                           n_tratores_venda, n_tratores_nome, tem_implemento, implemento_ultimo_em)
  WITH vinc AS (SELECT DISTINCT v.cliente_omie_id FROM public.agro_car_cliente_vinculo v),
  cad AS (                       -- cadastro com documento e nome comparáveis
    SELECT c.id_omie::text AS id_omie, NULLIF(regexp_replace(COALESCE(c.cnpj_cpf, ''), '\D', '', 'g'), '') AS documento,
           public.agro_norm(c.nome_fantasia) AS nome1, public.agro_norm(c.razao_social) AS nome2,
           public.agro_norm(c.cidade) AS cidade
      FROM public."portal_nt_clientes_PRINCIPAL" c
  ),
  cli AS (                       -- cliente do vínculo → documento
    SELECT v.cliente_omie_id, max(c.documento) AS documento, bool_or(c.id_omie IS NOT NULL) AS achou
      FROM vinc v LEFT JOIN cad c ON c.id_omie = v.cliente_omie_id
     GROUP BY v.cliente_omie_id
  ),
  ids AS (                       -- todos os códigos Omie do mesmo documento (NOVA e CASTRO)
    SELECT cl.cliente_omie_id, c.id_omie
      FROM cli cl JOIN cad c ON (cl.documento IS NOT NULL AND c.documento = cl.documento) OR c.id_omie = cl.cliente_omie_id
     GROUP BY cl.cliente_omie_id, c.id_omie
  ),
  venda AS (
    SELECT i.cliente_omie_id,
           max(public.agro_data_texto(vi.data_pedido)) FILTER (WHERE public.agro_familia_e(vi.familia, v_trat)) AS trator_em,
           count(*) FILTER (WHERE public.agro_familia_e(vi.familia, v_trat))::integer AS n_trat,
           max(public.agro_data_texto(vi.data_pedido)) FILTER (WHERE NOT public.agro_familia_e(vi.familia, v_trat) AND public.agro_familia_e(vi.familia, v_impl)) AS impl_em,
           count(*) FILTER (WHERE NOT public.agro_familia_e(vi.familia, v_trat) AND public.agro_familia_e(vi.familia, v_impl))::integer AS n_impl
      FROM ids i JOIN public.vendas_itens vi ON vi.codigo_cliente::text = i.id_omie
     GROUP BY i.cliente_omie_id
  ),
  -- controle de revisões: liga por NOME + MUNICÍPIO; mais de um documento candidato = descarta (Decisão 5)
  rev AS (
    SELECT t."Chassis" AS chassi, public.agro_data_texto(t."Entrega") AS entrega,
           public.agro_norm(t."Cliente") AS nome, public.agro_norm(t."Cidade") AS cidade
      FROM public.tratores t
     WHERE public.agro_norm(t."Cliente") IS NOT NULL AND public.agro_data_texto(t."Entrega") IS NOT NULL
  ),
  rev_cand AS (
    SELECT r.chassi, r.entrega, COALESCE(c.documento, 'omie:' || c.id_omie) AS quem
      FROM rev r JOIN cad c
        ON (c.nome1 = r.nome OR c.nome2 = r.nome)
       AND c.cidade IS NOT NULL
       AND (c.cidade = r.cidade OR (v_pref AND r.cidade LIKE c.cidade || ' %'))
     GROUP BY r.chassi, r.entrega, COALESCE(c.documento, 'omie:' || c.id_omie)
  ),
  rev_ok AS (
    SELECT chassi, entrega, min(quem) AS quem
      FROM rev_cand GROUP BY chassi, entrega HAVING count(*) = 1
  ),
  rev_cli AS (
    SELECT cl.cliente_omie_id, max(o.entrega) AS trator_em, count(*)::integer AS n
      FROM cli cl JOIN rev_ok o ON o.quem = COALESCE(cl.documento, 'omie:' || cl.cliente_omie_id)
     GROUP BY cl.cliente_omie_id
  )
  SELECT p_execucao_id, cl.cliente_omie_id, cl.documento,
         NULLIF(GREATEST(COALESCE(ve.trator_em, '0001-01-01'), COALESCE(rc.trator_em, '0001-01-01')), '0001-01-01'::date),
         CASE WHEN ve.trator_em IS NULL AND rc.trator_em IS NULL THEN NULL
              WHEN rc.trator_em IS NULL OR ve.trator_em >= rc.trator_em THEN 'venda_codigo'
              ELSE 'revisoes_nome' END,
         COALESCE(ve.n_trat, 0), COALESCE(rc.n, 0),
         CASE WHEN cl.achou THEN COALESCE(ve.n_impl, 0) > 0 END,
         ve.impl_em
    FROM cli cl
    LEFT JOIN venda ve   ON ve.cliente_omie_id = cl.cliente_omie_id
    LEFT JOIN rev_cli rc ON rc.cliente_omie_id = cl.cliente_omie_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_calcular_cliente_maquina(bigint) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Abrir a execução do score
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agro_score_iniciar(p_usuario text, p_user_id uuid DEFAULT NULL, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_perfil bigint; v_id bigint; v_mun integer; v_cli integer;
BEGIN
  PERFORM public.agro_exigir_acesso(p_user_id, true);
  IF p_usuario IS NULL OR p_usuario = '' THEN RAISE EXCEPTION 'usuário obrigatório'; END IF;
  SELECT execucao_id INTO v_perfil FROM public.agro_publicacao WHERE tipo = 'perfil_v2';
  IF v_perfil IS NULL THEN RAISE EXCEPTION 'não há perfil v2 publicado'; END IF;

  INSERT INTO public.agro_pipeline_execucao (fonte, versao, parametros, observacao, executado_por)
  VALUES ('score_v2', 'score v2 sobre perfil #' || v_perfil,
          jsonb_build_object('perfil_execucao_id', v_perfil, 'motivo', p_motivo,
                             'regras_ativas', (SELECT count(*) FROM public.agro_oportunidade_regra WHERE ativo),
                             'parametros', (SELECT jsonb_object_agg(chave, jsonb_build_object('valor', valor, 'versao', versao)) FROM public.agro_parametro)),
          p_motivo, p_usuario)
  RETURNING id INTO v_id;

  v_cli := public.agro_calcular_cliente_maquina(v_id);

  INSERT INTO public.agro_execucao_municipio (execucao_id, municipio_ibge)
  SELECT v_id, municipio_ibge FROM public.agro_perfil_item WHERE execucao_id = v_perfil GROUP BY municipio_ibge;
  GET DIAGNOSTICS v_mun = ROW_COUNT;

  UPDATE public.agro_pipeline_execucao
     SET parametros = parametros || jsonb_build_object('municipios', v_mun, 'clientes_vinculados', v_cli) WHERE id = v_id;
  RETURN jsonb_build_object('execucao_id', v_id, 'perfil_execucao_id', v_perfil, 'municipios', v_mun, 'clientes_vinculados', v_cli);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_score_iniciar(text, uuid, text) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Score de um município
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agro_score_municipio(p_execucao_id bigint, p_municipio_ibge integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_perfil bigint;
  v_curva  jsonb := public.agro_param('score_area_curva');
  v_pc     jsonb := public.agro_param('score_conquista_pesos');
  v_pb     jsonb := public.agro_param('score_base_pesos');
  v_cult   jsonb := public.agro_param('score_cultura_peso');
  v_prio   jsonb := public.agro_param('score_prioridade');
  v_bonus  jsonb := public.agro_param('score_bonus_credito');
  v_cres   jsonb := public.agro_param('score_base_crescimento');
  v_idade  jsonb := public.agro_param('score_base_trator_idade');
  v_fator  jsonb := public.agro_param('fator_confianca');
  v_n      integer;
  v_err    text;
BEGIN
  SELECT (parametros ->> 'perfil_execucao_id')::bigint INTO v_perfil
    FROM public.agro_pipeline_execucao WHERE id = p_execucao_id AND fonte = 'score_v2';
  IF v_perfil IS NULL THEN RAISE EXCEPTION 'execução % não é de score_v2', p_execucao_id; END IF;

  INSERT INTO public.agro_execucao_municipio (execucao_id, municipio_ibge, estado, iniciado_em)
  VALUES (p_execucao_id, p_municipio_ibge, 'pendente', now())
  ON CONFLICT (execucao_id, municipio_ibge) DO UPDATE SET estado = 'pendente', erro = NULL, iniciado_em = now(), concluido_em = NULL, linhas = NULL;

  BEGIN
    DELETE FROM public.agro_score_item WHERE execucao_id = p_execucao_id AND municipio_ibge = p_municipio_ibge;

    INSERT INTO public.agro_score_item (
      execucao_id, perfil_execucao_id, item, score_versao, lista, municipio_ibge,
      p_area, p_cultura, p_prioridade, p_crescimento, p_trator, p_implemento,
      soma, soma_max, fator_confianca, score_base, bonus_credito, score_com_bonus, regra_id, ausentes, detalhe)
    WITH it AS (
      SELECT p.* FROM public.agro_perfil_item p
       WHERE p.execucao_id = v_perfil AND p.municipio_ibge = p_municipio_ibge
    ),
    mem AS (
      SELECT it.item, it.item AS cod_car FROM it WHERE it.grupo_id IS NULL
      UNION ALL
      SELECT it.item, gm.cod_car FROM it JOIN public.agro_car_grupo_membro gm ON gm.grupo_id = it.grupo_id
    ),
    regra AS (                   -- mesma escolha do v1: cultura + faixa da área DA CULTURA, menor prioridade vence
      SELECT DISTINCT ON (it.item) it.item, r.id AS regra_id, r.prioridade, r.produto_sugerido
        FROM it JOIN public.agro_oportunidade_regra r
          ON r.ativo AND r.cultura_codigo = it.cultura_principal
         AND COALESCE(it.area_cultura_ha, 0) >= r.faixa_area_min
         AND (r.faixa_area_max IS NULL OR COALESCE(it.area_cultura_ha, 0) < r.faixa_area_max)
       ORDER BY it.item, r.prioridade, r.id
    ),
    util_ini AS (                -- área útil no ano inicial (mesma definição do pipeline: classes de uso)
      SELECT u.cod_car AS item, sum(u.area_ha) AS area
        FROM public.agro_uso_solo_car u
        JOIN public.agro_dominio_cultura d ON d.codigo = u.cultura_codigo AND cardinality(d.mapbiomas_classes) > 0
        JOIN it ON it.item = u.cod_car AND it.tem_vinculo
       WHERE u.fonte = 'mapbiomas' AND u.ano_safra = (v_cres ->> 'ano_inicial')::integer
       GROUP BY u.cod_car
    ),
    maq AS (                     -- máquinas de TODOS os clientes vinculados ao item
      SELECT mem.item,
             max(cm.trator_mais_novo_em) AS trator_em,
             (array_agg(cm.trator_origem ORDER BY cm.trator_mais_novo_em DESC NULLS LAST))[1] AS trator_origem,
             bool_or(cm.tem_implemento) AS tem_implemento,
             bool_or(cm.tem_implemento IS NOT NULL) AS sabe_implemento,
             count(DISTINCT v.cliente_omie_id)::integer AS n_clientes
        FROM mem
        JOIN public.agro_car_cliente_vinculo v ON v.cod_car = mem.cod_car
        LEFT JOIN public.agro_cliente_maquina cm ON cm.execucao_id = p_execucao_id AND cm.cliente_omie_id = v.cliente_omie_id
       GROUP BY mem.item
    ),
    par AS (
      SELECT it.item, it.municipio_ibge, it.tem_vinculo, it.confianca, it.tem_credito,
             it.credito_invest_36m, it.credito_custeio_12m, it.area_util_ha,
             COALESCE(it.cultura_principal, 'diversificado') AS cultura,
             public.agro_score_area(it.area_util_ha, v_curva) AS f_area,
             COALESCE((v_cult ->> COALESCE(it.cultura_principal, 'diversificado'))::numeric, (v_cult ->> 'outras')::numeric) AS pts_cultura,
             rg.regra_id, rg.prioridade, rg.produto_sugerido,
             CASE WHEN rg.regra_id IS NULL THEN (v_prio ->> 'sem_regra')::numeric
                  ELSE (v_prio ->> 'max')::numeric
                       - (LEAST(GREATEST(rg.prioridade, 1), (v_prio ->> 'niveis')::integer) - 1)
                         * ((v_prio ->> 'max')::numeric - (v_prio ->> 'min')::numeric)
                         / NULLIF((v_prio ->> 'niveis')::integer - 1, 0)
             END AS pts_prioridade,
             ui.area AS util_ini,
             CASE WHEN ui.area > 0 AND it.area_util_ha IS NOT NULL THEN (it.area_util_ha - ui.area) / ui.area * 100 END AS cresc_pct,
             mq.trator_em, mq.trator_origem, mq.tem_implemento, mq.sabe_implemento, mq.n_clientes,
             CASE WHEN mq.trator_em IS NOT NULL THEN (current_date - mq.trator_em) / 365.25 END AS trator_anos
        FROM it
        LEFT JOIN regra rg    ON rg.item = it.item
        LEFT JOIN util_ini ui ON ui.item = it.item
        LEFT JOIN maq mq      ON mq.item = it.item
    ),
    pts AS (
      SELECT p.*,
             CASE WHEN p.tem_vinculo THEN 'base' ELSE 'conquista' END AS lista,
             -- Conquista
             round(p.f_area * (v_pc ->> 'area')::numeric, 2)                            AS c_area,
             round(LEAST(p.pts_cultura, (v_pc ->> 'cultura')::numeric), 2)              AS c_cultura,
             round(LEAST(p.pts_prioridade, (v_pc ->> 'prioridade')::numeric), 2)        AS c_prioridade,
             -- Base instalada
             round(p.f_area * (v_pb ->> 'area')::numeric, 2)                            AS b_area,
             CASE WHEN p.cresc_pct IS NULL THEN NULL
                  WHEN p.cresc_pct > (v_cres ->> 'nivel2_pct')::numeric THEN (v_cres ->> 'pontos2')::numeric
                  WHEN p.cresc_pct > (v_cres ->> 'nivel1_pct')::numeric THEN (v_cres ->> 'pontos1')::numeric
                  ELSE 0 END                                                            AS b_cresc,
             CASE WHEN p.trator_anos IS NULL THEN NULL
                  WHEN p.trator_anos >= (v_idade ->> 'anos_velho')::numeric THEN (v_idade ->> 'pontos_velho')::numeric
                  WHEN p.trator_anos >= (v_idade ->> 'anos_meio')::numeric  THEN (v_idade ->> 'pontos_meio')::numeric
                  ELSE 0 END                                                            AS b_trator,
             CASE WHEN NOT COALESCE(p.sabe_implemento, false) THEN NULL
                  WHEN p.tem_implemento THEN 0
                  ELSE (v_pb ->> 'implemento')::numeric END                             AS b_impl,
             (v_fator ->> p.confianca)::numeric                                         AS fator,
             CASE WHEN NOT p.tem_credito THEN NULL
                  ELSE LEAST((v_bonus ->> 'teto')::numeric,
                             CASE WHEN p.credito_invest_36m  > 0 THEN (v_bonus ->> 'invest_36m')::numeric  ELSE 0 END
                           + CASE WHEN p.credito_custeio_12m > 0 THEN (v_bonus ->> 'custeio_12m')::numeric ELSE 0 END)
             END                                                                        AS bonus
        FROM par p
    ),
    som AS (
      SELECT s.*,
             CASE WHEN s.lista = 'conquista'
                  THEN COALESCE(s.c_area, 0) + s.c_cultura + s.c_prioridade
                  ELSE COALESCE(s.b_area, 0) + COALESCE(s.b_cresc, 0) + COALESCE(s.b_trator, 0) + COALESCE(s.b_impl, 0) END AS soma,
             CASE WHEN s.lista = 'conquista'
                  THEN CASE WHEN s.c_area IS NULL THEN 0 ELSE (v_pc ->> 'area')::numeric END
                       + (v_pc ->> 'cultura')::numeric + (v_pc ->> 'prioridade')::numeric
                  ELSE CASE WHEN s.b_area   IS NULL THEN 0 ELSE (v_pb ->> 'area')::numeric END
                     + CASE WHEN s.b_cresc  IS NULL THEN 0 ELSE (v_pb ->> 'crescimento')::numeric END
                     + CASE WHEN s.b_trator IS NULL THEN 0 ELSE (v_pb ->> 'trator')::numeric END
                     + CASE WHEN s.b_impl   IS NULL THEN 0 ELSE (v_pb ->> 'implemento')::numeric END END AS soma_max
        FROM pts s
    ),
    fim AS (
      SELECT f.*,
             round(CASE WHEN f.soma_max > 0 THEN f.soma / f.soma_max * 10 * f.fator ELSE 0 END, 2) AS score_base
        FROM som f
    )
    SELECT p_execucao_id, v_perfil, f.item, 2, f.lista, f.municipio_ibge,
           CASE WHEN f.lista = 'conquista' THEN f.c_area ELSE f.b_area END,
           CASE WHEN f.lista = 'conquista' THEN f.c_cultura END,
           CASE WHEN f.lista = 'conquista' THEN f.c_prioridade END,
           CASE WHEN f.lista = 'base' THEN f.b_cresc END,
           CASE WHEN f.lista = 'base' THEN f.b_trator END,
           CASE WHEN f.lista = 'base' THEN f.b_impl END,
           round(f.soma, 2), f.soma_max, f.fator, f.score_base, f.bonus,
           round(f.score_base + COALESCE(f.bonus, 0), 2),
           f.regra_id,
           array_remove(ARRAY[
             CASE WHEN f.area_util_ha IS NULL THEN 'area' END,
             CASE WHEN f.lista = 'base' AND f.b_cresc  IS NULL THEN 'crescimento' END,
             CASE WHEN f.lista = 'base' AND f.b_trator IS NULL THEN 'trator' END,
             CASE WHEN f.lista = 'base' AND f.b_impl   IS NULL THEN 'implemento' END], NULL),
           jsonb_strip_nulls(jsonb_build_object(
             'cultura', f.cultura, 'area_util_ha', f.area_util_ha,
             'regra_prioridade', f.prioridade, 'produto_sugerido', f.produto_sugerido,
             'crescimento_pct', round(f.cresc_pct, 1), 'area_util_inicial_ha', round(f.util_ini, 2),
             'trator_mais_novo_em', f.trator_em, 'trator_idade_anos', round(f.trator_anos, 1),
             'trator_origem', f.trator_origem,
             'trator_aviso', CASE WHEN f.trator_origem = 'revisoes_nome' THEN 'ligação por nome, não confirmada' END,
             'implemento_aviso', CASE WHEN f.lista = 'base' AND f.b_impl IS NOT NULL THEN 'histórico de vendas a partir de 2022' END,
             'clientes_vinculados', f.n_clientes,
             'credito', CASE WHEN f.bonus IS NULL THEN 'sem crédito localizável no SICOR' END))
      FROM fim f;
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
REVOKE EXECUTE ON FUNCTION public.agro_score_municipio(bigint, integer) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8) Publicar: só com todos os municípios 'ok'; percentis dentro de cada lista
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agro_score_publicar(p_execucao_id bigint, p_usuario text, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tot integer; v_ok integer; v_linhas integer; v_conq integer; v_base integer;
BEGIN
  PERFORM public.agro_exigir_acesso(p_user_id, true);
  IF NOT EXISTS (SELECT 1 FROM public.agro_pipeline_execucao WHERE id = p_execucao_id AND fonte = 'score_v2') THEN
    RAISE EXCEPTION 'execução % não é de score_v2', p_execucao_id;
  END IF;
  SELECT count(*), count(*) FILTER (WHERE estado = 'ok'), COALESCE(sum(linhas) FILTER (WHERE estado = 'ok'), 0)
    INTO v_tot, v_ok, v_linhas
    FROM public.agro_execucao_municipio WHERE execucao_id = p_execucao_id;
  IF v_tot = 0 THEN RAISE EXCEPTION 'execução % não tem municípios', p_execucao_id; END IF;
  IF v_ok < v_tot THEN
    RAISE EXCEPTION 'execução % incompleta: % de % municípios ok — não publica', p_execucao_id, v_ok, v_tot;
  END IF;

  UPDATE public.agro_score_item s SET percentil = x.pct
    FROM (SELECT item, round((percent_rank() OVER (PARTITION BY lista ORDER BY score_base) * 100)::numeric, 2) AS pct
            FROM public.agro_score_item WHERE execucao_id = p_execucao_id) x
   WHERE s.execucao_id = p_execucao_id AND s.item = x.item;

  SELECT count(*) FILTER (WHERE lista = 'conquista'), count(*) FILTER (WHERE lista = 'base')
    INTO v_conq, v_base FROM public.agro_score_item WHERE execucao_id = p_execucao_id;

  INSERT INTO public.agro_publicacao (tipo, execucao_id, publicado_por) VALUES ('score_v2', p_execucao_id, p_usuario)
  ON CONFLICT (tipo) DO UPDATE SET execucao_id = EXCLUDED.execucao_id, publicado_por = EXCLUDED.publicado_por, publicado_em = now();
  UPDATE public.agro_pipeline_execucao SET concluido_em = now(), linhas = v_linhas WHERE id = p_execucao_id;
  RETURN jsonb_build_object('execucao_id', p_execucao_id, 'municipios', v_tot, 'itens', v_linhas, 'conquista', v_conq, 'base', v_base);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_score_publicar(bigint, text, uuid) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9) Views (todas com security_invoker + REVOKE: view roda como o dono)
-- ─────────────────────────────────────────────────────────────────────────────
-- 9.1 lista publicada: perfil + score (o Gate 3 lê daqui)
CREATE OR REPLACE VIEW public.agro_v_score_item AS
SELECT s.execucao_id AS score_execucao_id, s.score_versao, s.lista, s.score_base, s.bonus_credito, s.score_com_bonus,
       s.percentil, s.p_area, s.p_cultura, s.p_prioridade, s.p_crescimento, s.p_trator, s.p_implemento,
       s.soma, s.soma_max, s.fator_confianca, s.regra_id, s.ausentes, s.detalhe,
       p.*, d.nome AS cultura_nome, d.grupo AS cultura_grupo
  FROM public.agro_score_item s
  JOIN public.agro_publicacao pub ON pub.tipo = 'score_v2' AND pub.execucao_id = s.execucao_id
  JOIN public.agro_perfil_item p ON p.execucao_id = s.perfil_execucao_id AND p.item = s.item
  LEFT JOIN public.agro_dominio_cultura d ON d.codigo = p.cultura_principal;
ALTER VIEW public.agro_v_score_item SET (security_invoker = true);
REVOKE ALL ON public.agro_v_score_item FROM anon, authenticated;

-- 9.2 calibração da curva: área útil dos imóveis de clientes que compraram trator da Nova.
--     Preparada, não aplicada. Sem vínculos, devolve n = 0 e percentis nulos.
CREATE OR REPLACE VIEW public.agro_v_calibracao_area AS
SELECT count(*)::integer AS n_imoveis,
       round(percentile_cont(0.10) WITHIN GROUP (ORDER BY v.area_util_ha)::numeric, 1) AS p10,
       round(percentile_cont(0.25) WITHIN GROUP (ORDER BY v.area_util_ha)::numeric, 1) AS p25,
       round(percentile_cont(0.50) WITHIN GROUP (ORDER BY v.area_util_ha)::numeric, 1) AS p50,
       round(percentile_cont(0.75) WITHIN GROUP (ORDER BY v.area_util_ha)::numeric, 1) AS p75,
       round(percentile_cont(0.90) WITHIN GROUP (ORDER BY v.area_util_ha)::numeric, 1) AS p90
  FROM public.agro_v_score_item v
 WHERE v.lista = 'base' AND v.area_util_ha IS NOT NULL AND v.detalhe ? 'trator_mais_novo_em';
ALTER VIEW public.agro_v_calibracao_area SET (security_invoker = true);
REVOKE ALL ON public.agro_v_calibracao_area FROM anon, authenticated;

-- 9.3 comparação v1 × v2: os 500 primeiros de cada lista, no nível do ITEM.
--     Um CAR do v1 que virou membro de grupo é contado pelo representante.
CREATE OR REPLACE VIEW public.agro_v_comparacao_v1_v2 AS
WITH pub AS (SELECT execucao_id FROM public.agro_publicacao WHERE tipo = 'score_v2'),
sc AS (SELECT s.* FROM public.agro_score_item s JOIN pub ON pub.execucao_id = s.execucao_id),
v1 AS (
  SELECT x.item, min(x.pos)::integer AS pos_v1, max(x.score) AS score_v1
    FROM (SELECT COALESCE(g.representante, t.cod_car) AS item, t.pos, t.score
            FROM (SELECT p.cod_car, p.score_oportunidade AS score,
                         row_number() OVER (ORDER BY p.score_oportunidade DESC, p.cod_car) AS pos
                    FROM public.agro_car_perfil p
                   ORDER BY p.score_oportunidade DESC, p.cod_car LIMIT 500) t
            LEFT JOIN public.agro_car_grupo_membro gm
                   ON gm.cod_car = t.cod_car AND gm.execucao_id = (SELECT max(perfil_execucao_id) FROM sc)
            LEFT JOIN public.agro_car_grupo g ON g.id = gm.grupo_id) x
   GROUP BY x.item
),
v2 AS (
  SELECT s.item, row_number() OVER (ORDER BY s.score_base DESC, s.item)::integer AS pos_v2, s.score_base AS score_v2
    FROM sc s WHERE s.lista = 'conquista'
   ORDER BY s.score_base DESC, s.item LIMIT 500
)
SELECT COALESCE(v1.item, v2.item) AS item,
       (v1.item IS NOT NULL) AS em_v1, (v2.item IS NOT NULL) AS em_v2,
       v1.pos_v1, v2.pos_v2, v1.score_v1, v2.score_v2,
       pi.municipio, pi.area_util_ha, COALESCE(pi.cultura_principal, 'diversificado') AS cultura, pi.confianca,
       CASE WHEN pi.area_util_ha IS NULL THEN 'sem área útil'
            WHEN pi.area_util_ha < 5    THEN '1) abaixo de 5 ha'
            WHEN pi.area_util_ha < 20   THEN '2) 5 a 20 ha'
            WHEN pi.area_util_ha < 100  THEN '3) 20 a 100 ha'
            WHEN pi.area_util_ha < 300  THEN '4) 100 a 300 ha'
            WHEN pi.area_util_ha < 1000 THEN '5) 300 a 1.000 ha'
            ELSE '6) acima de 1.000 ha' END AS faixa_area
  FROM v1 FULL JOIN v2 ON v2.item = v1.item
  LEFT JOIN public.agro_perfil_item pi
         ON pi.item = COALESCE(v1.item, v2.item) AND pi.execucao_id = (SELECT max(perfil_execucao_id) FROM sc);
ALTER VIEW public.agro_v_comparacao_v1_v2 SET (security_invoker = true);
REVOKE ALL ON public.agro_v_comparacao_v1_v2 FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────────────
-- PÓS-CHECKS
-- ─────────────────────────────────────────────────────────────────────────────
--   SELECT count(*) FROM public.agro_parametro;                                  -- 21
--   SELECT public.agro_score_area(3, public.agro_param('score_area_curva')),     -- 0
--          public.agro_score_area(12.5, public.agro_param('score_area_curva')),  -- 0.5
--          public.agro_score_area(100, public.agro_param('score_area_curva')),   -- 1
--          public.agro_score_area(650, public.agro_param('score_area_curva')),   -- 0.625
--          public.agro_score_area(5000, public.agro_param('score_area_curva'));  -- 0.25
--   SELECT public.agro_norm('São José (SP)'), public.agro_data_texto('28/02/2019'), public.agro_data_texto('31/02/2019');
--          -- SAO JOSE | 2019-02-28 | NULL
--   SELECT count(*) FROM public.agro_car_perfil;                                 -- 31655 (v1 intocado)
-- Depois: python scripts/agro/recalcular_score_v2.py
