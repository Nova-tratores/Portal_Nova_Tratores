-- =============================================================================
-- INTELIGÊNCIA AGRÍCOLA POR CAR — schema de dados (Fase 1 do plano)
-- Plano: docs/inteligencia-agricola-car-plano.md · Fase 0: docs/agro/fase0-levantamento.md
--
-- O plano falava em "schema agro". Aqui as tabelas ficam em PUBLIC com prefixo
-- agro_ (mesmo padrão de mkt_, frota_, tickets_): schema fora do public exige
-- expor em pgrst.db_schemas + NOTIFY e já quebrou Realtime neste projeto
-- (ver memória supabase-schema-nao-public). O prefixo dá o mesmo isolamento
-- sem essa dor.
--
-- PRINCÍPIOS
--  * Idempotente: pode rodar inteiro de novo.
--  * RLS ON com ZERO policy em TUDO: o navegador não lê nem escreve com a anon
--    key. Leitura pelo portal via /api/agro/* (service role + autenticar());
--    escrita humana (vínculo, validação) só pelas RPCs SECURITY DEFINER daqui,
--    chamadas das rotas com o usuário vindo da sessão.
--  * O pipeline (Python local, service role) grava as tabelas de dados e SEMPRE
--    aponta para uma linha de agro_pipeline_execucao — é o que permite refazer,
--    comparar e desfazer uma carga.
--  * Geometria em SIRGAS 2000 (SRID 4674) — é o SRID nativo do SICAR e do IBGE;
--    área em hectares calculada em geography (metros reais), nunca em graus.
--  * Nenhuma tabela existente é alterada.
--
-- APLICAR À MÃO no SQL Editor do Supabase, ANTES de rodar o pipeline da Fase 1.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 0 — PRÉ-CHECKS (rode isolado, só leitura, e LEIA a saída)
-- ─────────────────────────────────────────────────────────────────────────────
-- 0.1 PostGIS já está instalado? (se não, a seção 1 instala — precisa do Supabase
--     ter a extensão disponível, que ele tem em todos os planos)
--   SELECT extname, extversion, extnamespace::regnamespace FROM pg_extension WHERE extname = 'postgis';
--
-- 0.2 Nenhuma tabela agro_* existe ainda?
--   SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'agro\_%';
--   -- esperado: 0 linhas na 1ª aplicação


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 1 — EXTENSÃO
-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase recomenda extensões no schema "extensions" (já está no search_path
-- dos roles do projeto, por isso "geometry" e ST_* funcionam sem prefixo).
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 2 — EXECUÇÕES DO PIPELINE (vem primeiro: tudo aponta pra cá)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agro_pipeline_execucao (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fonte         text NOT NULL CHECK (fonte IN ('sicar','mapbiomas','sicor','ibge_pam','sentinel','perfil')),
  versao        text NOT NULL,                 -- ex.: 'sicar-wfs 2026-09-25', 'mapbiomas col10', 'sicor 2019-2024'
  iniciado_em   timestamptz NOT NULL DEFAULT now(),
  concluido_em  timestamptz,
  linhas        integer,
  parametros    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- municípios, anos, thresholds usados
  observacao    text,
  executado_por text                           -- snapshot do nome/e-mail de quem rodou
);
COMMENT ON TABLE public.agro_pipeline_execucao IS 'Uma linha por rodada do pipeline offline. Todo dado derivado aponta pra cá (refazer/comparar/desfazer).';


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 3 — IMÓVEIS (SICAR)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agro_car_imovel (
  cod_car          text PRIMARY KEY,           -- 'SP-3538808-4B75...'
  uf               text NOT NULL,
  municipio_ibge   integer NOT NULL,
  municipio        text NOT NULL,
  area_ha          numeric(12,4) NOT NULL,      -- área declarada no SICAR
  modulos_fiscais  numeric(10,4),
  status_car       text NOT NULL CHECK (status_car IN ('AT','PE','CA','SU')),  -- ativo/pendente/cancelado/suspenso
  condicao         text,
  tipo_imovel      text,                        -- IRU / AST / PCT
  criado_sicar_em  timestamptz,
  geom             geometry(MultiPolygon, 4674) NOT NULL,
  geom_area_util   geometry(MultiPolygon, 4674),     -- Fase 1: geom menos vegetação nativa/APP/água (MapBiomas)
  area_util_ha     numeric(12,4),                    -- base do pct_area_util (NUNCA usar area_ha como base)
  execucao_id      bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agro_car_imovel_geom_gist ON public.agro_car_imovel USING gist (geom);
CREATE INDEX IF NOT EXISTS agro_car_imovel_municipio_idx ON public.agro_car_imovel (municipio_ibge);
CREATE INDEX IF NOT EXISTS agro_car_imovel_status_idx ON public.agro_car_imovel (status_car) WHERE status_car = 'AT';
COMMENT ON COLUMN public.agro_car_imovel.status_car IS 'Fase 0: em Piraju 2 imóveis CANCELADOS cobrem o município inteiro — nunca somar área sem filtrar AT.';

CREATE TABLE IF NOT EXISTS public.agro_car_sobreposicao (
  cod_car_a          text NOT NULL REFERENCES public.agro_car_imovel(cod_car) ON DELETE CASCADE,
  cod_car_b          text NOT NULL REFERENCES public.agro_car_imovel(cod_car) ON DELETE CASCADE,
  area_sobreposta_ha numeric(12,4) NOT NULL,
  pct_a              numeric(6,2) NOT NULL,     -- % da área de A que está sobreposta
  pct_b              numeric(6,2) NOT NULL,
  execucao_id        bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id),
  PRIMARY KEY (cod_car_a, cod_car_b),
  CHECK (cod_car_a < cod_car_b)                 -- cada par uma vez só
);
CREATE INDEX IF NOT EXISTS agro_car_sobreposicao_b_idx ON public.agro_car_sobreposicao (cod_car_b);


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 4 — VOCABULÁRIO ÚNICO DE CULTURA (sem isto as fontes não conversam)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agro_dominio_cultura (
  codigo            text PRIMARY KEY,
  nome              text NOT NULL,
  grupo             text NOT NULL CHECK (grupo IN ('temporaria','perene','pastagem','silvicultura','outro')),
  mapbiomas_classes integer[] NOT NULL DEFAULT '{}',   -- classes da coleção 10 que caem aqui
  sicor_produtos    text[] NOT NULL DEFAULT '{}',      -- PRODUTO do Empreendimento.csv (maiúsculo, como vem)
  ordem             integer NOT NULL DEFAULT 100
);
-- Seed (MapBiomas col.10: 39 soja, 41 outras temporárias, 46 café, 47 citros, 48 outras perenes,
-- 20 cana, 15 pastagem, 9 silvicultura, 21 mosaico de usos, 40 arroz, 62 algodão, 35 dendê).
-- MILHO não tem classe própria no MapBiomas — só entra via SICOR até a Fase 5.
INSERT INTO public.agro_dominio_cultura (codigo, nome, grupo, mapbiomas_classes, sicor_produtos, ordem) VALUES
  ('soja',        'Soja',                       'temporaria',   '{39}',    '{SOJA}',                                   10),
  ('milho',       'Milho',                      'temporaria',   '{}',      '{MILHO}',                                  20),
  ('sorgo',       'Sorgo',                      'temporaria',   '{}',      '{SORGO}',                                  25),
  ('trigo',       'Trigo',                      'temporaria',   '{}',      '{TRIGO}',                                  26),
  ('feijao',      'Feijão',                     'temporaria',   '{}',      '{FEIJÃO,FEIJAO}',                          27),
  ('algodao',     'Algodão',                    'temporaria',   '{62}',    '{ALGODÃO,ALGODAO}',                        28),
  ('arroz',       'Arroz',                      'temporaria',   '{40}',    '{ARROZ}',                                  29),
  ('horti',       'Hortaliças / olerícolas',    'temporaria',   '{}',      '{TOMATE,BATATA,CEBOLA,ALHO,CENOURA,PIMENTÃO,PIMENTAO,ALFACE}', 30),
  ('outras_temp', 'Outras lavouras temporárias','temporaria',   '{41}',    '{TRITICALE,AVEIA,CEVADA,MANDIOCA,AMENDOIM,GIRASSOL}',          39),
  ('mosaico',     'Mosaico de usos (agricultura + pastagem)', 'outro', '{21}', '{}',                                                       80),
  ('cana',        'Cana-de-açúcar',             'temporaria',   '{20}',    '{CANA-DE-AÇÚCAR,CANA-DE-ACUCAR}',          40),
  ('cafe',        'Café',                       'perene',       '{46}',    '{CAFÉ,CAFE}',                              50),
  ('citros',      'Citros',                     'perene',       '{47}',    '{LARANJA,LIMÃO,LIMAO,TANGERINA}',          51),
  ('outras_peren','Outras lavouras perenes',    'perene',       '{48,35}', '{ABACATE,UVA,MANGA,BANANA,MACADÂMIA,MACADAMIA,ATEMOIA,GOIABA,MARACUJÁ,MARACUJA}', 59),
  ('pastagem',    'Pastagem / pecuária',        'pastagem',     '{15}',    '{BOVINOS,PASTAGEM,OVINOS,CAPRINOS,LEITE,SUÍNOS,SUINOS,PEIXE,AVES,BUBALINOS}',      60),
  ('silvicultura','Silvicultura',               'silvicultura', '{9}',     '{EUCALIPTO,PINUS}',                        70),
  ('outro',       'Outro / não classificado',   'outro',        '{}',      '{}',                                       99)
ON CONFLICT (codigo) DO UPDATE SET sicor_produtos = EXCLUDED.sicor_produtos;  -- só o vocabulário SICOR é sobrescrito (cresce com o uso)
-- Produtos de INVESTIMENTO (CORREÇÃO INTENSIVA DO SOLO, IRRIGAÇÃO, ARMAZÉM/SILO/GALPÃO, Terraços/Cercas, SECADOR…)
-- ficam propositalmente SEM cultura (cultura_codigo NULL): não são o que se planta, são o que se compra.


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 5 — USO DO SOLO POR CAR (N linhas por safra × fonte × cultura)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agro_uso_solo_car (
  cod_car        text NOT NULL REFERENCES public.agro_car_imovel(cod_car) ON DELETE CASCADE,
  ano_safra      integer NOT NULL,
  fonte          text NOT NULL CHECK (fonte IN ('mapbiomas','sicor','sentinel','campo')),
  cultura_codigo text NOT NULL REFERENCES public.agro_dominio_cultura(codigo),
  area_ha        numeric(12,4) NOT NULL,
  pct_area_util  numeric(6,2),                 -- sobre area_util_ha do imóvel (não sobre a área total!)
  execucao_id    bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id),
  PRIMARY KEY (cod_car, ano_safra, fonte, cultura_codigo)
);
CREATE INDEX IF NOT EXISTS agro_uso_solo_car_safra_idx ON public.agro_uso_solo_car (ano_safra, cultura_codigo);


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 6 — CRÉDITO RURAL (SICOR)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agro_sicor_operacao (
  ref_bacen        bigint NOT NULL,
  nu_ordem         integer NOT NULL,
  dt_emissao       date NOT NULL,
  ano_emissao      integer GENERATED ALWAYS AS (EXTRACT(YEAR FROM dt_emissao)::integer) STORED,
  uf               text NOT NULL,
  cd_empreendimento text NOT NULL,
  finalidade       text,                         -- Custeio / Investimento / Comercialização / Industrialização
  atividade        text,                         -- Agrícola / Pecuário(a)
  modalidade       text,
  produto          text,                         -- como vem do Empreendimento.csv (maiúsculo)
  cultura_codigo   text REFERENCES public.agro_dominio_cultura(codigo),  -- traduzido via sicor_produtos
  valor            numeric(14,2) NOT NULL,       -- VL_PARC_CREDITO
  area_financiada  numeric(12,4),                -- VL_AREA_FINANC
  programa         text,
  fonte_recurso    text,
  cnpj_if          text,
  execucao_id      bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id),
  PRIMARY KEY (ref_bacen, nu_ordem)
);
CREATE INDEX IF NOT EXISTS agro_sicor_operacao_ano_idx ON public.agro_sicor_operacao (ano_emissao, uf);
COMMENT ON TABLE public.agro_sicor_operacao IS 'Microdados BCB SICOR_OPERACAO_BASICA_ESTADO_<ano>. Não traz município: o município vem da gleba.';

CREATE TABLE IF NOT EXISTS public.agro_sicor_gleba (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref_bacen        bigint NOT NULL,
  nu_ordem         integer NOT NULL,
  nu_identificador bigint NOT NULL,
  nu_indice_gleba  integer NOT NULL,
  n_pontos         integer NOT NULL,
  geom             geometry(Polygon, 4674),      -- NULL quando a gleba tem < 3 pontos
  centroide        geometry(Point, 4674) NOT NULL,
  area_ha          numeric(12,4),
  municipio_ibge   integer,                      -- por recorte espacial (centróide)
  execucao_id      bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id),
  UNIQUE (ref_bacen, nu_ordem, nu_identificador, nu_indice_gleba)
);
CREATE INDEX IF NOT EXISTS agro_sicor_gleba_geom_gist ON public.agro_sicor_gleba USING gist (geom);
CREATE INDEX IF NOT EXISTS agro_sicor_gleba_centroide_gist ON public.agro_sicor_gleba USING gist (centroide);
CREATE INDEX IF NOT EXISTS agro_sicor_gleba_op_idx ON public.agro_sicor_gleba (ref_bacen, nu_ordem);
COMMENT ON TABLE public.agro_sicor_gleba IS 'SICOR_GLEBAS.gz (um ponto por linha no BCB) já montado em polígono. Fase 0: 100% das glebas de Piraju têm polígono com precisão métrica.';

-- resultado do cruzamento gleba→CAR (regra do plano: o CAR que contém >= 50% da gleba)
CREATE TABLE IF NOT EXISTS public.agro_sicor_gleba_car (
  gleba_id         bigint NOT NULL REFERENCES public.agro_sicor_gleba(id) ON DELETE CASCADE,
  cod_car          text NOT NULL REFERENCES public.agro_car_imovel(cod_car) ON DELETE CASCADE,
  pct_gleba_no_car numeric(6,2) NOT NULL,
  metodo           text NOT NULL DEFAULT 'intersecao_50' CHECK (metodo IN ('intersecao_50','centroide','manual')),
  execucao_id      bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id),
  PRIMARY KEY (gleba_id, cod_car)
);
CREATE INDEX IF NOT EXISTS agro_sicor_gleba_car_car_idx ON public.agro_sicor_gleba_car (cod_car);


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 7 — PERFIL CONSOLIDADO (materializado pelo pipeline a cada execução)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agro_car_perfil (
  cod_car            text PRIMARY KEY REFERENCES public.agro_car_imovel(cod_car) ON DELETE CASCADE,
  ano_safra          integer NOT NULL,
  cultura_principal  text REFERENCES public.agro_dominio_cultura(codigo),  -- NULL = 'Diversificado' (< 30% da área útil)
  area_cultura_ha    numeric(12,4),
  pct_area_util      numeric(6,2),
  confianca          text NOT NULL CHECK (confianca IN ('alta','media','baixa')),
  motivo_confianca   text NOT NULL,              -- sempre legível na tela ("MapBiomas e SICOR concordam em 2025", ...)
  fonte_principal    text NOT NULL,              -- mapbiomas / sicor / campo
  credito_12m        numeric(14,2) NOT NULL DEFAULT 0,
  credito_36m        numeric(14,2) NOT NULL DEFAULT 0,
  credito_invest_36m numeric(14,2) NOT NULL DEFAULT 0,   -- finalidade Investimento (sinal de máquina/benfeitoria)
  ultima_finalidade  text,
  ultimo_credito_em  date,
  score_oportunidade numeric(8,2) NOT NULL DEFAULT 0,
  score_detalhe      jsonb NOT NULL DEFAULT '{}'::jsonb, -- componentes do score, pra tela explicar
  execucao_id        bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id),
  calculado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agro_car_perfil_score_idx ON public.agro_car_perfil (score_oportunidade DESC);
CREATE INDEX IF NOT EXISTS agro_car_perfil_cultura_idx ON public.agro_car_perfil (cultura_principal, confianca);


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 8 — PONTE COM O COMERCIAL (único ponto de escrita humana)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agro_car_cliente_vinculo (
  cod_car          text NOT NULL REFERENCES public.agro_car_imovel(cod_car) ON DELETE CASCADE,
  cliente_omie_id  text NOT NULL,                -- código do cliente na Omie (texto: o portal usa string nos dois lados)
  cliente_nome     text,                         -- snapshot (o cadastro pode mudar)
  origem           text NOT NULL CHECK (origem IN ('manual','sugerido','importado')),
  confirmado_por   text NOT NULL,                -- e-mail/nome do usuário da sessão (snapshot)
  confirmado_em    timestamptz NOT NULL DEFAULT now(),
  observacao       text,
  PRIMARY KEY (cod_car, cliente_omie_id)
);
CREATE INDEX IF NOT EXISTS agro_car_cliente_vinculo_cliente_idx ON public.agro_car_cliente_vinculo (cliente_omie_id);

CREATE TABLE IF NOT EXISTS public.agro_car_validacao (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cod_car        text NOT NULL REFERENCES public.agro_car_imovel(cod_car) ON DELETE CASCADE,
  ano_safra      integer NOT NULL,
  cultura_real   text NOT NULL REFERENCES public.agro_dominio_cultura(codigo),
  confirmou      boolean NOT NULL,               -- true = "cultura confirmada"; false = "estava errada, a real é cultura_real"
  informado_por  text NOT NULL,
  informado_em   timestamptz NOT NULL DEFAULT now(),
  fonte          text NOT NULL DEFAULT 'cockpit' CHECK (fonte IN ('cockpit','lista','visita','telefone','outro')),
  observacao     text
);
CREATE INDEX IF NOT EXISTS agro_car_validacao_car_idx ON public.agro_car_validacao (cod_car, ano_safra);
COMMENT ON TABLE public.agro_car_validacao IS 'Verdade de campo. Sempre vence o dado estimado e vira rótulo de treino (Fase 5).';


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 9 — REGRAS DE OPORTUNIDADE (tabela, nunca hardcode)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agro_oportunidade_regra (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cultura_codigo   text NOT NULL REFERENCES public.agro_dominio_cultura(codigo),
  faixa_area_min   numeric(12,2) NOT NULL DEFAULT 0,
  faixa_area_max   numeric(12,2),                -- NULL = sem teto
  produto_sugerido text NOT NULL,                -- ex.: 'Mahindra 6075 4x4'
  argumento        text,                         -- o que o vendedor fala
  prioridade       integer NOT NULL DEFAULT 5,   -- 1 = mais importante
  peso_area        numeric(6,3) NOT NULL DEFAULT 1,
  peso_credito     numeric(6,3) NOT NULL DEFAULT 1,
  peso_sem_compra  numeric(6,3) NOT NULL DEFAULT 1,
  ativo            boolean NOT NULL DEFAULT true,
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  CHECK (faixa_area_max IS NULL OR faixa_area_max > faixa_area_min)
);
CREATE INDEX IF NOT EXISTS agro_oportunidade_regra_cultura_idx ON public.agro_oportunidade_regra (cultura_codigo) WHERE ativo;


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 10 — RLS: ON em tudo, ZERO policy (acesso só pelo service role)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.agro_pipeline_execucao     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agro_car_imovel            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agro_car_sobreposicao      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agro_dominio_cultura       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agro_uso_solo_car          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agro_sicor_operacao        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agro_sicor_gleba           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agro_sicor_gleba_car       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agro_car_perfil            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agro_car_cliente_vinculo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agro_car_validacao         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agro_oportunidade_regra    ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 11 — FUNÇÕES DO PIPELINE (rodam no banco, com índice GIST)
-- ─────────────────────────────────────────────────────────────────────────────
-- 11.1 Atribuição gleba → CAR (Fase 2). Regra do plano: a gleba vai para o CAR
--      ATIVO que contém >= 50% da área dela; se nenhum passa disso, fica sem
--      atribuição (melhor do que atribuir errado). Idempotente por execução.
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
REVOKE EXECUTE ON FUNCTION public.agro_atribuir_glebas(bigint, numeric) FROM PUBLIC, anon, authenticated;

-- 11.2 Sobreposição entre CARs ativos do mesmo município (Fase 1). Só pares com
--      interseção real; pct sobre a área de cada lado. Idempotente por execução.
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
     AND ST_Area(ST_Intersection(ST_MakeValid(a.geom), ST_MakeValid(b.geom))::geography) > 100;   -- ignora toque de borda (< 100 m²)

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_calcular_sobreposicoes(bigint, integer) FROM PUBLIC, anon, authenticated;

-- 11.3 Geometrias inválidas do SICAR (auto-interseção) derrubam o ST_Intersection
--      com "GEOS TopologyException" (aconteceu em Arandu). Rodar depois de cada
--      carga: SELECT * FROM agro_corrigir_geometrias();
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
     SET geom = ST_GeometryN(ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3)), 1)   -- ST_Dump não pode em UPDATE
   WHERE geom IS NOT NULL AND NOT ST_IsValid(geom);
  GET DIAGNOSTICS v_gleba = ROW_COUNT;
  RETURN QUERY SELECT 'agro_car_imovel'::text, v_car UNION ALL SELECT 'agro_sicor_gleba'::text, v_gleba;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_corrigir_geometrias() FROM PUBLIC, anon, authenticated;

-- 11.4 Área útil do imóvel = soma das culturas de USO (as que têm classe MapBiomas)
--      na safra mais recente. Em SQL, de uma vez: 28 mil PATCHes pela REST
--      saturaram o Supabase. O mapbiomas_zonal.py chama esta RPC no fim.
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


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 12 — RPCs DE ESCRITA HUMANA (chamadas SÓ pelas rotas /api/agro/*,
--            que passam o usuário da sessão em p_usuario)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agro_vincular_cliente(
  p_cod_car text, p_cliente_omie_id text, p_cliente_nome text, p_usuario text,
  p_origem text DEFAULT 'manual', p_observacao text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_usuario IS NULL OR p_usuario = '' THEN RAISE EXCEPTION 'usuário obrigatório'; END IF;
  INSERT INTO public.agro_car_cliente_vinculo (cod_car, cliente_omie_id, cliente_nome, origem, confirmado_por, observacao)
  VALUES (p_cod_car, p_cliente_omie_id, p_cliente_nome, p_origem, p_usuario, p_observacao)
  ON CONFLICT (cod_car, cliente_omie_id) DO UPDATE
     SET cliente_nome = EXCLUDED.cliente_nome, origem = EXCLUDED.origem,
         confirmado_por = EXCLUDED.confirmado_por, confirmado_em = now(), observacao = EXCLUDED.observacao;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_vincular_cliente(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.agro_validar_cultura(
  p_cod_car text, p_ano_safra integer, p_cultura_real text, p_confirmou boolean, p_usuario text,
  p_fonte text DEFAULT 'cockpit', p_observacao text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF p_usuario IS NULL OR p_usuario = '' THEN RAISE EXCEPTION 'usuário obrigatório'; END IF;
  INSERT INTO public.agro_car_validacao (cod_car, ano_safra, cultura_real, confirmou, informado_por, fonte, observacao)
  VALUES (p_cod_car, p_ano_safra, p_cultura_real, p_confirmou, p_usuario, p_fonte, p_observacao)
  RETURNING id INTO v_id;
  -- validação de campo sempre vence: reflete no perfil na hora (o pipeline recalcula o resto depois)
  UPDATE public.agro_car_perfil
     SET cultura_principal = p_cultura_real, confianca = 'alta', fonte_principal = 'campo',
         motivo_confianca = 'Validado em campo por ' || p_usuario || ' em ' || to_char(now(), 'DD/MM/YYYY')
   WHERE cod_car = p_cod_car;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_validar_cultura(text, integer, text, boolean, text, text, text) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 13 — VIEW DE LEITURA DO PORTAL (lida pelas rotas com service role)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.agro_v_car_perfil AS
SELECT i.cod_car, i.uf, i.municipio_ibge, i.municipio, i.area_ha, i.area_util_ha, i.modulos_fiscais,
       i.status_car, i.tipo_imovel,
       p.ano_safra, p.cultura_principal, d.nome AS cultura_nome, d.grupo AS cultura_grupo,
       p.area_cultura_ha, p.pct_area_util, p.confianca, p.motivo_confianca, p.fonte_principal,
       p.credito_12m, p.credito_36m, p.credito_invest_36m, p.ultima_finalidade, p.ultimo_credito_em,
       p.score_oportunidade, p.score_detalhe, p.calculado_em,
       (SELECT count(*) FROM public.agro_car_cliente_vinculo v WHERE v.cod_car = i.cod_car)::integer AS vinculos,
       (SELECT max(pct_a) FROM public.agro_car_sobreposicao s WHERE s.cod_car_a = i.cod_car)          AS sobreposicao_pct,
       ST_AsGeoJSON(ST_Centroid(i.geom))::jsonb AS centroide
  FROM public.agro_car_imovel i
  LEFT JOIN public.agro_car_perfil p ON p.cod_car = i.cod_car
  LEFT JOIN public.agro_dominio_cultura d ON d.codigo = p.cultura_principal;
-- ⚠️ View NÃO herda RLS por padrão: roda com os privilégios do DONO (postgres),
-- que passa por cima do RLS das tabelas — a anon key leria tudo pela view.
-- security_invoker (PG 15+) faz a view rodar como quem chama; com RLS ON e zero
-- policy, anon lê [] e o service role (bypassrls) lê tudo. E por garantia, revoga.
ALTER VIEW public.agro_v_car_perfil SET (security_invoker = true);
REVOKE ALL ON public.agro_v_car_perfil FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 14 — PÓS-CHECK
-- ─────────────────────────────────────────────────────────────────────────────
--   SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'agro\_%' ORDER BY 1;
--   -- esperado: 12 tabelas + agro_v_car_perfil
--   SELECT count(*) FROM public.agro_dominio_cultura;   -- esperado: 16
