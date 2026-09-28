-- =============================================================================
-- AGRO — Score v2 · GATE 1: parâmetros, grupos de duplicatas, vínculo tipado,
--        motivo da confiança como código e recálculo em SQL por município.
-- Prompt-file "Score v2 e correções de base (1.1 a 1.6)" + Decisões após o Gate 0.
-- Reconhecimento: docs/agro/score-v2-gate0.md
--
-- PRINCÍPIOS
--  * Nada do v1 é apagado: agro_car_perfil (score v1, execução #14) e a view
--    agro_v_car_perfil ficam como estão. O v2 mora em tabelas novas, por execução.
--  * Padrão de segurança do módulo mantido (Decisão 1): RLS ON sem policy, EXECUTE
--    revogado de anon/authenticated, acesso só pelas rotas /api/agro/* (service role).
--    Novidade: as RPCs de ação humana conferem a permissão DENTRO da função
--    (agro_exigir_acesso), com o user_id que a rota tirou do token.
--  * Todo limite é parâmetro (agro_parametro), com histórico de quem mudou.
--  * A tela lê SEMPRE a última execução PUBLICADA (agro_publicacao). Uma execução
--    só publica com todos os municípios 'ok' — nunca lista pela metade.
--  * Idempotente, exceto o bloco 6 (vínculo), que exige uma decisão sua — leia.
--
-- ORDEM: 1) publicar o código (as rotas novas já caem no formato antigo se esta
--           migration ainda não existir); 2) aplicar este arquivo no SQL Editor;
--        3) rodar scripts/agro/recalcular_v2.py.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- PRÉ-CHECKS (rode isolado, só leitura)
-- ─────────────────────────────────────────────────────────────────────────────
--   SELECT count(*) FROM public.agro_car_perfil;                          -- 31655 (v1, intocado)
--   SELECT count(*) FROM public.agro_car_sobreposicao WHERE pct_a >= 95 AND pct_b >= 95;   -- 349 (só mesmo município)
--   SELECT * FROM public.agro_car_cliente_vinculo;                        -- 1 linha (ver bloco 6)
--   SELECT pg_typeof(modulos_permitidos) FROM public.portal_permissoes LIMIT 1;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1) EXECUÇÕES: fontes novas + estado por município + ponteiro de publicação
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.agro_pipeline_execucao DROP CONSTRAINT IF EXISTS agro_pipeline_execucao_fonte_check;
ALTER TABLE public.agro_pipeline_execucao
  ADD CONSTRAINT agro_pipeline_execucao_fonte_check
  CHECK (fonte IN ('sicar','mapbiomas','sicor','ibge_pam','sentinel','perfil','crm','sobreposicao','perfil_v2'));

CREATE TABLE IF NOT EXISTS public.agro_execucao_municipio (
  execucao_id    bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id) ON DELETE CASCADE,
  municipio_ibge integer NOT NULL,
  estado         text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','ok','erro')),
  erro           text,
  linhas         integer,
  iniciado_em    timestamptz,
  concluido_em   timestamptz,
  PRIMARY KEY (execucao_id, municipio_ibge)
);
ALTER TABLE public.agro_execucao_municipio ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.agro_publicacao (
  tipo          text PRIMARY KEY CHECK (tipo IN ('perfil_v2')),
  execucao_id   bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id),
  publicado_por text NOT NULL,
  publicado_em  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agro_publicacao ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.agro_publicacao IS 'Ponteiro da última execução COMPLETA. A tela lê só o que está publicado.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) PARÂMETROS (tabela, nunca código) + histórico
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agro_parametro (
  chave          text PRIMARY KEY,
  valor          jsonb NOT NULL,
  grupo          text NOT NULL,
  descricao      text NOT NULL,
  versao         integer NOT NULL DEFAULT 1,
  atualizado_por text NOT NULL DEFAULT 'migration gate 1',
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.agro_parametro_hist (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave          text NOT NULL,
  valor_anterior jsonb,
  valor_novo     jsonb NOT NULL,
  versao         integer NOT NULL,
  alterado_por   text NOT NULL,
  alterado_em    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agro_parametro      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agro_parametro_hist ENABLE ROW LEVEL SECURITY;

INSERT INTO public.agro_parametro (chave, valor, grupo, descricao) VALUES
  ('duplicata_mutuo_min_pct',        '95',  'duplicatas', 'Sobreposição MÚTUA mínima (%) para dois CARs serem o mesmo imóvel.'),
  ('contido_min_pct',                '95',  'duplicatas', 'Um CAR está "contido em" outro quando esta % dele está dentro do outro e a recíproca não passa do limite de duplicata.'),
  ('sobreposicao_alta_pct',          '20',  'confianca',  'Acima desta % de sobreposição com CAR de fora do grupo, a confiança é rebaixada.'),
  ('cultura_principal_min_pct',      '30',  'confianca',  'Uma cultura precisa ocupar esta % da área útil para ser a cultura principal; abaixo disso o imóvel é diversificado.'),
  ('fonte_unica_min_pct',            '60',  'confianca',  'Com uma fonte só, a cultura precisa ocupar esta % da área útil para a confiança ser média.'),
  ('sicor_janela_anos_atras',        '2',   'confianca',  'Quantos anos antes da safra base o crédito ainda conta para dizer a cultura.'),
  ('culturas_teto_media_satelite',   '["cafe","cana"]', 'confianca', 'Culturas que, vistas só pelo satélite, ficam no máximo em confiança média.'),
  ('culturas_nao_principais',        '["mosaico","outro"]', 'confianca', 'Classes que nunca viram cultura principal.'),
  ('fator_confianca',                '{"alta":1,"media":0.85,"baixa":0.6}', 'score', 'Multiplicador do score por nível de confiança.')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.agro_param(p_chave text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT valor FROM public.agro_parametro WHERE chave = p_chave;
$$;
CREATE OR REPLACE FUNCTION public.agro_param_num(p_chave text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (valor #>> '{}')::numeric FROM public.agro_parametro WHERE chave = p_chave;
$$;
CREATE OR REPLACE FUNCTION public.agro_param_lista(p_chave text)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(x), '{}') FROM public.agro_parametro p, jsonb_array_elements_text(p.valor) x WHERE p.chave = p_chave;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_param(text), public.agro_param_num(text), public.agro_param_lista(text) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3) PERMISSÃO DENTRO DA RPC (Decisão 1)
--    p_user_id vem do token validado pela rota. NULL só passa quando quem chama é
--    o pipeline (service role, sem usuário) ou o SQL Editor — nunca o navegador,
--    que não tem EXECUTE em nada daqui.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agro_tem_acesso(p_user_id uuid, p_gestao boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portal_permissoes p
     WHERE p.user_id = p_user_id
       AND (p.is_admin IS TRUE OR p.is_dev IS TRUE
            OR (NOT p_gestao AND EXISTS (               -- mesma regra de temAcessoAgro() nas rotas
                  SELECT 1 FROM jsonb_array_elements_text(COALESCE(to_jsonb(p.modulos_permitidos), '[]'::jsonb)) m
                   WHERE m = 'dashboard-agro' OR m LIKE 'agro%')))
  );
$$;

CREATE OR REPLACE FUNCTION public.agro_exigir_acesso(p_user_id uuid, p_gestao boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF p_user_id IS NULL THEN
    IF v_role = 'service_role' OR (v_role = '' AND session_user IN ('postgres', 'supabase_admin')) THEN
      RETURN;                                   -- pipeline / SQL Editor
    END IF;
    RAISE EXCEPTION 'agro: usuário obrigatório' USING ERRCODE = '42501';
  END IF;
  IF NOT public.agro_tem_acesso(p_user_id, p_gestao) THEN
    RAISE EXCEPTION 'agro: sem permissão%', CASE WHEN p_gestao THEN ' (exige gestão)' ELSE ' para o Dashboard Agro' END USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_tem_acesso(uuid, boolean), public.agro_exigir_acesso(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- mudar parâmetro: só gestão, com histórico. (O recálculo é disparado pela rota — Gate 3.)
CREATE OR REPLACE FUNCTION public.agro_parametro_definir(p_chave text, p_valor jsonb, p_usuario text, p_user_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ant jsonb; v_ver integer;
BEGIN
  PERFORM public.agro_exigir_acesso(p_user_id, true);
  IF p_usuario IS NULL OR p_usuario = '' THEN RAISE EXCEPTION 'usuário obrigatório'; END IF;
  SELECT valor, versao INTO v_ant, v_ver FROM public.agro_parametro WHERE chave = p_chave FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'parâmetro desconhecido: %', p_chave; END IF;
  IF v_ant = p_valor THEN RETURN v_ver; END IF;
  UPDATE public.agro_parametro SET valor = p_valor, versao = v_ver + 1, atualizado_por = p_usuario, atualizado_em = now() WHERE chave = p_chave;
  INSERT INTO public.agro_parametro_hist (chave, valor_anterior, valor_novo, versao, alterado_por) VALUES (p_chave, v_ant, p_valor, v_ver + 1, p_usuario);
  RETURN v_ver + 1;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_parametro_definir(text, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4) SOBREPOSIÇÃO ENTRE MUNICÍPIOS VIZINHOS (Decisão 8)
--    A função antiga só cruza CARs do MESMO município. Esta cruza os CARs do
--    município pedido com os de OUTROS municípios. Um par de divisa é achado
--    pelos dois lados: o ON CONFLICT resolve.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agro_calcular_sobreposicoes_vizinhos(p_execucao_id bigint, p_municipio_ibge integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_n integer;
BEGIN
  INSERT INTO public.agro_car_sobreposicao (cod_car_a, cod_car_b, area_sobreposta_ha, pct_a, pct_b, execucao_id)
  SELECT x.ca, x.cb,
         round((x.ai / 10000)::numeric, 4),
         round((x.ai / NULLIF(x.area_a, 0) * 100)::numeric, 2),
         round((x.ai / NULLIF(x.area_b, 0) * 100)::numeric, 2),
         p_execucao_id
    FROM (
      SELECT LEAST(a.cod_car, b.cod_car) AS ca, GREATEST(a.cod_car, b.cod_car) AS cb,
             ST_Area(ST_Intersection(ST_MakeValid(a.geom), ST_MakeValid(b.geom))::geography) AS ai,
             ST_Area((CASE WHEN a.cod_car < b.cod_car THEN a.geom ELSE b.geom END)::geography) AS area_a,
             ST_Area((CASE WHEN a.cod_car < b.cod_car THEN b.geom ELSE a.geom END)::geography) AS area_b
        FROM public.agro_car_imovel a
        JOIN public.agro_car_imovel b
          ON b.status_car = 'AT' AND b.municipio_ibge <> a.municipio_ibge
         AND a.geom && b.geom AND ST_Intersects(a.geom, b.geom)
       WHERE a.status_car = 'AT' AND a.municipio_ibge = p_municipio_ibge
    ) x
   WHERE x.ai > 100
  ON CONFLICT (cod_car_a, cod_car_b) DO UPDATE
     SET area_sobreposta_ha = EXCLUDED.area_sobreposta_ha, pct_a = EXCLUDED.pct_a, pct_b = EXCLUDED.pct_b;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_calcular_sobreposicoes_vizinhos(bigint, integer) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5) GRUPOS DE DUPLICATAS (1.5) — por execução, escopo GLOBAL
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agro_car_grupo (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  execucao_id    bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id) ON DELETE CASCADE,
  representante  text NOT NULL REFERENCES public.agro_car_imovel(cod_car) ON DELETE CASCADE,
  municipio_ibge integer NOT NULL,              -- o do representante
  n_membros      integer NOT NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (execucao_id, representante)
);
CREATE TABLE IF NOT EXISTS public.agro_car_grupo_membro (
  execucao_id bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id) ON DELETE CASCADE,
  grupo_id    bigint NOT NULL REFERENCES public.agro_car_grupo(id) ON DELETE CASCADE,
  cod_car     text NOT NULL REFERENCES public.agro_car_imovel(cod_car) ON DELETE CASCADE,
  PRIMARY KEY (execucao_id, cod_car)            -- um CAR está em no máximo um grupo por execução
);
CREATE INDEX IF NOT EXISTS agro_car_grupo_membro_grupo_idx ON public.agro_car_grupo_membro (grupo_id);
CREATE TABLE IF NOT EXISTS public.agro_car_grupo_rejeitado (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  execucao_id bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id) ON DELETE CASCADE,
  membros     text[] NOT NULL,
  n_membros   integer NOT NULL,
  n_pares_ok  integer NOT NULL,                 -- pares com sobreposição mútua >= limite
  n_pares_esperados integer NOT NULL,           -- n*(n-1)/2
  motivo      text NOT NULL
);
ALTER TABLE public.agro_car_grupo           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agro_car_grupo_membro    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agro_car_grupo_rejeitado ENABLE ROW LEVEL SECURITY;

-- Componentes conexos por propagação de rótulo. Um componente só vira grupo se
-- TODOS os pares internos tiverem sobreposição mútua >= limite (clique); senão a
-- cadeia A≈B≈C poderia juntar A e C que não são o mesmo imóvel — vai pra rejeitados.
CREATE OR REPLACE FUNCTION public.agro_calcular_grupos(p_execucao_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lim numeric := public.agro_param_num('duplicata_mutuo_min_pct');
  v_mudou integer; v_grupos integer; v_membros integer; v_rej integer; v_arestas integer;
BEGIN
  DELETE FROM public.agro_car_grupo_membro    WHERE execucao_id = p_execucao_id;
  DELETE FROM public.agro_car_grupo           WHERE execucao_id = p_execucao_id;
  DELETE FROM public.agro_car_grupo_rejeitado WHERE execucao_id = p_execucao_id;

  DROP TABLE IF EXISTS _agro_aresta; DROP TABLE IF EXISTS _agro_no; DROP TABLE IF EXISTS _agro_comp;
  CREATE TEMP TABLE _agro_aresta ON COMMIT DROP AS
    SELECT s.cod_car_a AS a, s.cod_car_b AS b
      FROM public.agro_car_sobreposicao s
      JOIN public.agro_car_imovel ia ON ia.cod_car = s.cod_car_a AND ia.status_car = 'AT'
      JOIN public.agro_car_imovel ib ON ib.cod_car = s.cod_car_b AND ib.status_car = 'AT'
     WHERE s.pct_a >= v_lim AND s.pct_b >= v_lim;
  GET DIAGNOSTICS v_arestas = ROW_COUNT;

  CREATE TEMP TABLE _agro_no ON COMMIT DROP AS
    SELECT x.cod, x.cod AS rotulo FROM (SELECT a AS cod FROM _agro_aresta UNION SELECT b FROM _agro_aresta) x;
  CREATE INDEX ON _agro_no (cod);

  LOOP
    UPDATE _agro_no n SET rotulo = m.menor
      FROM (SELECT n1.cod, min(n2.rotulo) AS menor
              FROM _agro_no n1
              JOIN (SELECT a AS x, b AS y FROM _agro_aresta UNION ALL SELECT b, a FROM _agro_aresta) e ON e.x = n1.cod
              JOIN _agro_no n2 ON n2.cod = e.y
             GROUP BY n1.cod) m
     WHERE m.cod = n.cod AND m.menor < n.rotulo;
    GET DIAGNOSTICS v_mudou = ROW_COUNT;
    EXIT WHEN v_mudou = 0;
  END LOOP;

  CREATE TEMP TABLE _agro_comp ON COMMIT DROP AS
    SELECT c.rotulo, c.membros, c.n,
           (SELECT count(*) FROM _agro_aresta e
              JOIN _agro_no na ON na.cod = e.a JOIN _agro_no nb ON nb.cod = e.b
             WHERE na.rotulo = c.rotulo AND nb.rotulo = c.rotulo)::integer AS n_arestas
      FROM (SELECT rotulo, array_agg(cod ORDER BY cod) AS membros, count(*)::integer AS n FROM _agro_no GROUP BY rotulo) c;

  INSERT INTO public.agro_car_grupo_rejeitado (execucao_id, membros, n_membros, n_pares_ok, n_pares_esperados, motivo)
  SELECT p_execucao_id, membros, n, n_arestas, n * (n - 1) / 2,
         'cadeia: nem todos os pares têm sobreposição mútua >= ' || v_lim || '% (' || n_arestas || ' de ' || (n * (n - 1) / 2) || ')'
    FROM _agro_comp WHERE n_arestas < n * (n - 1) / 2;
  GET DIAGNOSTICS v_rej = ROW_COUNT;

  -- representante: ativo → cadastro mais recente → maior área
  INSERT INTO public.agro_car_grupo (execucao_id, representante, municipio_ibge, n_membros)
  SELECT p_execucao_id, r.cod_car, r.municipio_ibge, c.n
    FROM _agro_comp c
   CROSS JOIN LATERAL (
     SELECT i.cod_car, i.municipio_ibge FROM public.agro_car_imovel i
      WHERE i.cod_car = ANY (c.membros)
      ORDER BY (i.status_car = 'AT') DESC, i.criado_sicar_em DESC NULLS LAST, i.area_ha DESC, i.cod_car
      LIMIT 1) r
   WHERE c.n_arestas >= c.n * (c.n - 1) / 2;
  GET DIAGNOSTICS v_grupos = ROW_COUNT;

  INSERT INTO public.agro_car_grupo_membro (execucao_id, grupo_id, cod_car)
  SELECT p_execucao_id, g.id, m.cod
    FROM _agro_comp c
    JOIN public.agro_car_grupo g ON g.execucao_id = p_execucao_id AND g.representante = ANY (c.membros)
   CROSS JOIN LATERAL unnest(c.membros) AS m(cod)
   WHERE c.n_arestas >= c.n * (c.n - 1) / 2;
  GET DIAGNOSTICS v_membros = ROW_COUNT;

  RETURN jsonb_build_object('limite_pct', v_lim, 'pares_duplicados', v_arestas, 'grupos', v_grupos,
                            'cars_agrupados', v_membros, 'componentes_rejeitados', v_rej);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_calcular_grupos(bigint) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6) VÍNCULO TIPADO (1.4) — ⚠️ EXIGE UMA DECISÃO SUA (Decisão 7)
--    Hoje existe 1 vínculo: CAR SP-3515400-C0AF…1548 ↔ "Faz São José" (Omie 990100104),
--    aceito por financeiro@novatratores.com.br em 28/09/2026 12:16 UTC (5 minutos
--    depois do deploy da tela), a partir de uma sugestão por visita.
--    Troque PREENCHER abaixo por:
--      'apagar'                 → era teste: remove o vínculo e devolve a sugestão a 'pendente'
--      'proprietario' | 'arrendatario_operador' | 'parceiro' | 'outro' → é real, com esse tipo
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.agro_car_cliente_vinculo ADD COLUMN IF NOT EXISTS tipo text;

DO $$
DECLARE
  v_decisao text := 'PREENCHER';          -- ← edite esta linha antes de rodar
  v_sem_tipo integer;
BEGIN
  SELECT count(*) INTO v_sem_tipo FROM public.agro_car_cliente_vinculo WHERE tipo IS NULL;
  IF v_sem_tipo = 0 THEN RETURN; END IF;                       -- já resolvido (reexecução)
  IF v_decisao = 'PREENCHER' THEN
    RAISE EXCEPTION 'Há % vínculo(s) sem tipo. Edite v_decisao no bloco 6 (apagar | proprietario | arrendatario_operador | parceiro | outro).', v_sem_tipo;
  ELSIF v_decisao = 'apagar' THEN
    UPDATE public.agro_car_vinculo_sugestao s
       SET status = 'pendente', decidido_por = NULL, decidido_em = NULL, atualizado_em = now()
      FROM public.agro_car_cliente_vinculo v
     WHERE v.tipo IS NULL AND s.cod_car = v.cod_car AND s.cliente_omie_id = v.cliente_omie_id AND s.status = 'aceita';
    DELETE FROM public.agro_car_cliente_vinculo WHERE tipo IS NULL;
  ELSIF v_decisao IN ('proprietario', 'arrendatario_operador', 'parceiro', 'outro') THEN
    UPDATE public.agro_car_cliente_vinculo SET tipo = v_decisao WHERE tipo IS NULL;
  ELSE
    RAISE EXCEPTION 'v_decisao inválida: %', v_decisao;
  END IF;
END $$;

ALTER TABLE public.agro_car_cliente_vinculo ALTER COLUMN tipo SET NOT NULL;
ALTER TABLE public.agro_car_cliente_vinculo DROP CONSTRAINT IF EXISTS agro_car_cliente_vinculo_tipo_check;
ALTER TABLE public.agro_car_cliente_vinculo
  ADD CONSTRAINT agro_car_cliente_vinculo_tipo_check CHECK (tipo IN ('proprietario', 'arrendatario_operador', 'parceiro', 'outro'));
-- chave única passa a incluir o tipo: o mesmo cliente pode ser dono E operador; o imóvel pode ter vários vínculos
ALTER TABLE public.agro_car_cliente_vinculo DROP CONSTRAINT IF EXISTS agro_car_cliente_vinculo_pkey;
ALTER TABLE public.agro_car_cliente_vinculo ADD PRIMARY KEY (cod_car, cliente_omie_id, tipo);

-- RPCs de vínculo: assinatura nova (tipo obrigatório + user_id). As antigas saem,
-- senão o PostgREST não sabe qual escolher.
DROP FUNCTION IF EXISTS public.agro_vincular_cliente(text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.agro_vincular_cliente(
  p_cod_car text, p_cliente_omie_id text, p_cliente_nome text, p_usuario text, p_tipo text,
  p_origem text DEFAULT 'manual', p_observacao text DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.agro_exigir_acesso(p_user_id, false);
  IF p_usuario IS NULL OR p_usuario = '' THEN RAISE EXCEPTION 'usuário obrigatório'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('proprietario', 'arrendatario_operador', 'parceiro', 'outro') THEN
    RAISE EXCEPTION 'tipo de vínculo obrigatório (proprietario | arrendatario_operador | parceiro | outro)';
  END IF;
  INSERT INTO public.agro_car_cliente_vinculo (cod_car, cliente_omie_id, cliente_nome, origem, confirmado_por, observacao, tipo)
  VALUES (p_cod_car, p_cliente_omie_id, p_cliente_nome, p_origem, p_usuario, p_observacao, p_tipo)
  ON CONFLICT (cod_car, cliente_omie_id, tipo) DO UPDATE
     SET cliente_nome = EXCLUDED.cliente_nome, origem = EXCLUDED.origem,
         confirmado_por = EXCLUDED.confirmado_por, confirmado_em = now(), observacao = EXCLUDED.observacao;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_vincular_cliente(text, text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.agro_decidir_sugestao(text, text, boolean, text);
CREATE OR REPLACE FUNCTION public.agro_decidir_sugestao(
  p_cod_car text, p_cliente_ref text, p_aceitar boolean, p_usuario text,
  p_tipo text DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.agro_car_vinculo_sugestao%ROWTYPE;
BEGIN
  PERFORM public.agro_exigir_acesso(p_user_id, false);
  IF p_usuario IS NULL OR p_usuario = '' THEN RAISE EXCEPTION 'usuário obrigatório'; END IF;
  IF p_aceitar AND (p_tipo IS NULL OR p_tipo NOT IN ('proprietario', 'arrendatario_operador', 'parceiro', 'outro')) THEN
    RAISE EXCEPTION 'para aceitar é obrigatório escolher o tipo de vínculo';
  END IF;
  SELECT * INTO s FROM public.agro_car_vinculo_sugestao WHERE cod_car = p_cod_car AND cliente_ref = p_cliente_ref FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sugestão não encontrada'; END IF;
  IF s.status <> 'pendente' THEN RETURN s.status; END IF;

  IF p_aceitar THEN
    PERFORM public.agro_vincular_cliente(
      s.cod_car, s.cliente_omie_id, s.cliente_nome, p_usuario, p_tipo, 'sugerido',
      'via visitas do CRM: ' || s.n_presenciais || ' visita(s), ' || array_to_string(s.vendedores, ', '), p_user_id);
  END IF;
  UPDATE public.agro_car_vinculo_sugestao
     SET status = CASE WHEN p_aceitar THEN 'aceita' ELSE 'rejeitada' END,
         decidido_por = p_usuario, decidido_em = now(), atualizado_em = now()
   WHERE cod_car = p_cod_car AND cliente_ref = p_cliente_ref;
  RETURN CASE WHEN p_aceitar THEN 'aceita' ELSE 'rejeitada' END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_decidir_sugestao(text, text, boolean, text, text, uuid) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7) PERFIL v2 POR ITEM (um item = um grupo de duplicatas OU um CAR sozinho)
--    "o que o imóvel é" (cultura_principal / diversificado) separado de "quão
--    seguro é o dado" (confianca + motivo_codigo + rebaixadores).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agro_perfil_item (
  execucao_id        bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id) ON DELETE CASCADE,
  item               text NOT NULL REFERENCES public.agro_car_imovel(cod_car) ON DELETE CASCADE,  -- o representante
  grupo_id           bigint REFERENCES public.agro_car_grupo(id) ON DELETE SET NULL,              -- NULL = CAR sozinho
  n_cars             integer NOT NULL DEFAULT 1,
  municipio_ibge     integer NOT NULL,
  municipio          text NOT NULL,
  ano_safra          integer NOT NULL,
  area_ha            numeric(12,4),
  area_util_ha       numeric(12,4),
  cultura_principal  text REFERENCES public.agro_dominio_cultura(codigo),   -- NULL = diversificado
  area_cultura_ha    numeric(12,4),
  pct_area_util      numeric(6,2),
  mosaico_pct        numeric(6,2),
  confianca          text NOT NULL CHECK (confianca IN ('alta','media','baixa')),
  motivo_codigo      text NOT NULL CHECK (motivo_codigo IN (
                       'validado_campo','fontes_concordam','fontes_discordam','fonte_unica_60',
                       'fonte_unica_abaixo_60','cafe_cana_satelite','fonte_unica_credito','diversificado')),
  rebaixadores       text[] NOT NULL DEFAULT '{}',        -- hoje só 'sobreposicao_alta'
  motivo_texto       text NOT NULL,
  fonte_principal    text NOT NULL,                       -- campo | mapbiomas | sicor
  sobreposicao_pct   numeric(6,2) NOT NULL DEFAULT 0,     -- máx. com CAR de FORA do grupo
  contido_em         text,                                -- CAR maior que contém este
  tem_credito        boolean NOT NULL DEFAULT false,      -- false = "sem crédito localizável", não zero
  n_operacoes        integer NOT NULL DEFAULT 0,
  credito_12m        numeric(14,2) NOT NULL DEFAULT 0,
  credito_36m        numeric(14,2) NOT NULL DEFAULT 0,
  credito_invest_36m numeric(14,2) NOT NULL DEFAULT 0,
  credito_custeio_12m numeric(14,2) NOT NULL DEFAULT 0,
  ultima_finalidade  text,
  ultimo_credito_em  date,
  tem_vinculo        boolean NOT NULL DEFAULT false,      -- qualquer tipo, em qualquer CAR do grupo
  calculado_em       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (execucao_id, item)
);
CREATE INDEX IF NOT EXISTS agro_perfil_item_mun_idx  ON public.agro_perfil_item (execucao_id, municipio_ibge);
CREATE INDEX IF NOT EXISTS agro_perfil_item_conf_idx ON public.agro_perfil_item (execucao_id, confianca, motivo_codigo);
ALTER TABLE public.agro_perfil_item ENABLE ROW LEVEL SECURITY;

-- 7.1 abre a execução: snapshot dos parâmetros, grupos (global) e a fila de municípios
CREATE OR REPLACE FUNCTION public.agro_iniciar_recalculo(p_usuario text, p_user_id uuid DEFAULT NULL, p_safra integer DEFAULT NULL, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id bigint; v_safra integer; v_grupos jsonb; v_mun integer;
BEGIN
  PERFORM public.agro_exigir_acesso(p_user_id, true);
  IF p_usuario IS NULL OR p_usuario = '' THEN RAISE EXCEPTION 'usuário obrigatório'; END IF;
  v_safra := COALESCE(p_safra, (SELECT max(ano_safra) FROM public.agro_uso_solo_car WHERE fonte = 'mapbiomas'));
  IF v_safra IS NULL THEN RAISE EXCEPTION 'não há uso do solo carregado'; END IF;

  INSERT INTO public.agro_pipeline_execucao (fonte, versao, parametros, observacao, executado_por)
  VALUES ('perfil_v2', 'perfil v2 safra ' || v_safra,
          jsonb_build_object('safra', v_safra, 'motivo', p_motivo,
                             'parametros', (SELECT jsonb_object_agg(chave, jsonb_build_object('valor', valor, 'versao', versao)) FROM public.agro_parametro)),
          p_motivo, p_usuario)
  RETURNING id INTO v_id;

  v_grupos := public.agro_calcular_grupos(v_id);

  INSERT INTO public.agro_execucao_municipio (execucao_id, municipio_ibge)
  SELECT v_id, municipio_ibge FROM public.agro_car_imovel WHERE status_car = 'AT' GROUP BY municipio_ibge;
  GET DIAGNOSTICS v_mun = ROW_COUNT;

  UPDATE public.agro_pipeline_execucao SET parametros = parametros || jsonb_build_object('grupos', v_grupos, 'municipios', v_mun) WHERE id = v_id;
  RETURN jsonb_build_object('execucao_id', v_id, 'safra', v_safra, 'municipios', v_mun, 'grupos', v_grupos);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_iniciar_recalculo(text, uuid, integer, text) FROM PUBLIC, anon, authenticated;

-- 7.2 um município por chamada (idempotente; erro fica registrado e pode ser refeito)
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
    op_area AS (
      SELECT ref_bacen, nu_ordem, sum(COALESCE(area_ha, 0)) AS area_total, count(*) AS n
        FROM public.agro_sicor_gleba GROUP BY ref_bacen, nu_ordem
    ),
    cred AS (                  -- uma linha por item × OPERAÇÃO DISTINTA; valor rateado pelas glebas do grupo
      SELECT mem.item, o.ref_bacen, o.nu_ordem, o.dt_emissao, o.finalidade, o.cultura_codigo,
             o.valor * LEAST(CASE WHEN oa.area_total > 0 THEN sum(COALESCE(gl.area_ha, 0)) / oa.area_total
                                  ELSE count(*)::numeric / GREATEST(oa.n, 1) END, 1) AS valor_rateado
        FROM (SELECT DISTINCT m.item, gc.gleba_id      -- a mesma gleba em dois CARs do grupo conta UMA vez
                FROM mem m JOIN public.agro_sicor_gleba_car gc ON gc.cod_car = m.cod_car) mem
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
       WHERE NOT EXISTS (SELECT 1 FROM mem m WHERE m.item = p.item AND m.cod_car = p.outro)
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
           (SELECT u.area_ha FROM uso u WHERE u.item = c.item AND u.cultura_codigo = c.cultura),
           (SELECT round(LEAST(u.area_ha / NULLIF(c.area_util_ha, 0) * 100, 100)::numeric, 2) FROM uso u WHERE u.item = c.item AND u.cultura_codigo = c.cultura),
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
      FROM conf c;
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

-- 7.3 publica: só com TODOS os municípios 'ok'
CREATE OR REPLACE FUNCTION public.agro_publicar_execucao(p_execucao_id bigint, p_usuario text, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tot integer; v_ok integer; v_linhas integer;
BEGIN
  PERFORM public.agro_exigir_acesso(p_user_id, true);
  SELECT count(*), count(*) FILTER (WHERE estado = 'ok'), COALESCE(sum(linhas) FILTER (WHERE estado = 'ok'), 0)
    INTO v_tot, v_ok, v_linhas
    FROM public.agro_execucao_municipio WHERE execucao_id = p_execucao_id;
  IF v_tot = 0 THEN RAISE EXCEPTION 'execução % não tem municípios', p_execucao_id; END IF;
  IF v_ok < v_tot THEN
    RAISE EXCEPTION 'execução % incompleta: % de % municípios ok — não publica', p_execucao_id, v_ok, v_tot;
  END IF;
  INSERT INTO public.agro_publicacao (tipo, execucao_id, publicado_por) VALUES ('perfil_v2', p_execucao_id, p_usuario)
  ON CONFLICT (tipo) DO UPDATE SET execucao_id = EXCLUDED.execucao_id, publicado_por = EXCLUDED.publicado_por, publicado_em = now();
  UPDATE public.agro_pipeline_execucao SET concluido_em = now(), linhas = v_linhas WHERE id = p_execucao_id;
  RETURN jsonb_build_object('execucao_id', p_execucao_id, 'municipios', v_tot, 'itens', v_linhas);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_publicar_execucao(bigint, text, uuid) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8) VIEW DA EXECUÇÃO PUBLICADA (a tela do Gate 3 lê daqui; hoje ninguém lê)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.agro_v_perfil_item AS
SELECT p.*, d.nome AS cultura_nome, d.grupo AS cultura_grupo
  FROM public.agro_perfil_item p
  JOIN public.agro_publicacao pub ON pub.tipo = 'perfil_v2' AND pub.execucao_id = p.execucao_id
  LEFT JOIN public.agro_dominio_cultura d ON d.codigo = p.cultura_principal;
ALTER VIEW public.agro_v_perfil_item SET (security_invoker = true);
REVOKE ALL ON public.agro_v_perfil_item FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────────────
-- PÓS-CHECKS
-- ─────────────────────────────────────────────────────────────────────────────
--   SELECT count(*) FROM public.agro_parametro;                                            -- 9
--   SELECT count(*) FROM public.agro_car_perfil;                                           -- 31655 (v1 intocado)
--   SELECT cod_car, cliente_nome, tipo FROM public.agro_car_cliente_vinculo;               -- 0 ou 1 linha, com tipo
--   SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc
--    WHERE proname IN ('agro_vincular_cliente','agro_decidir_sugestao') ORDER BY 1;        -- UMA assinatura de cada
--   SELECT public.agro_tem_acesso('<seu user_id>'::uuid, true);                            -- true
-- Depois: python scripts/agro/recalcular_v2.py   (sobreposição de divisa → grupos → 45 municípios → publica)
