-- =====================================================================
-- MARGEM DE REVISÕES POR MODELO (v1) — módulo `revisoes-margem`
-- Portal Nova Tratores · Empresa NOVA apenas. Rodar no SQL Editor do Supabase.
--
-- Objetivo: base de dados da tela que substitui a planilha manual de kits de
-- revisão, calculando a margem REAL de cada revisão (peças via CMC + mão de
-- obra + impostos + comissão + fator de realização).
--
-- Três tabelas:
--   1. revisao_parametros       — parâmetros de cálculo, versionados por vigência
--   2. revisao_horas_padrao     — horas de MO e pagador por (cod_trator, horas_kit)
--   3. revisao_margem_snapshot  — congelamento mensal para comparação histórica
--
-- Acesso: LEITURA pelo portal (authenticated). ESCRITA só via rotas
-- /api/ppv/revisoes/* (service role, que ignora RLS) — por isso NÃO há policies
-- de INSERT/UPDATE/DELETE, seguindo o padrão de sql/create-tickets.sql.
--
-- Idempotente: reexecutar não duplica nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. revisao_parametros — versionado por vigência
--
-- Nunca fazer UPDATE destrutivo nos parâmetros: para mudar um valor,
-- ENCERRA-SE a vigência atual (vigencia_fim = data) e INSERE-SE uma linha
-- nova. Assim os snapshots históricos (tabela 3) continuam explicáveis pela
-- vigência que estava ativa na competência.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revisao_parametros (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vigencia_inicio        DATE NOT NULL DEFAULT CURRENT_DATE,
  vigencia_fim           DATE,                          -- NULL = vigência ativa

  -- Receita de serviço (parâmetros, não constantes)
  valor_hora_cliente     NUMERIC NOT NULL DEFAULT 200,  -- R$/h balcão. Omie 'hr' hoje = 193
  valor_hora_garantia    NUMERIC NOT NULL DEFAULT 130,  -- R$/h Mahindra. Omie 'hr.m' hoje = 110
  tarifa_km              NUMERIC NOT NULL DEFAULT 2.80,  -- R$/km. Omie 'KM' hoje = 3,60

  -- Custo de pessoal (custo_mensal = salario_base * fator_encargos)
  salario_base           NUMERIC NOT NULL DEFAULT 2500,
  fator_encargos         NUMERIC NOT NULL DEFAULT 1.672208, -- 13º+férias+FGTS+multa+INSS => 4180,52/2500
  horas_uteis_mes        NUMERIC NOT NULL DEFAULT 176,

  -- Alocação das horas pagas em 3 baldes (serviço / deslocamento / ócio).
  -- ócio é derivado: 1 - pct_servico - pct_deslocamento.
  -- Seed = 30h serviço / 70h deslocamento / 76h ócio (ocupação faturável ~17%).
  pct_servico            NUMERIC NOT NULL DEFAULT 0.170455,  -- 30/176
  pct_deslocamento       NUMERIC NOT NULL DEFAULT 0.397727,  -- 70/176
  velocidade_media_kmh   NUMERIC NOT NULL DEFAULT 45,    -- ESTIMATIVA (pendência #4 — validar via rastreador)
  custo_combustivel_km   NUMERIC NOT NULL DEFAULT 1.12,  -- ESTIMATIVA (pendência #4 — validar via cartão combustível)
  custo_manutencao_km    NUMERIC NOT NULL DEFAULT 0.55,  -- ESTIMATIVA (pendência #4 — manut/depreciação do veículo)

  -- Impostos sobre RECEITA de serviço (NOVA = Lucro Real). Carga 12,25%.
  aliquota_iss           NUMERIC NOT NULL DEFAULT 0.03,
  aliquota_pis_cofins    NUMERIC NOT NULL DEFAULT 0.0925,

  -- Peças: o CMC de Produtos_Completos vem BRUTO (impostos embutidos). A NOVA
  -- é Lucro Real, então parte é crédito recuperável. v1: pct_credito_cmc = 0
  -- (CMC bruto, margem de peças conservadora — nunca inflada). Ver §2.5 do prompt.
  cmc_liquido_de_impostos BOOLEAN NOT NULL DEFAULT false,
  pct_credito_cmc        NUMERIC NOT NULL DEFAULT 0,     -- fração do CMC que é crédito. custo = CMC*(1-pct)

  -- Comissão sobre MÃO DE OBRA apenas (nunca peças, nunca deslocamento).
  -- Varia 15%–30% por nível do mecânico. comissao_media = default da tela;
  -- na v1 é manual — o ideal é calculá-la da folha por competência (pendência #2).
  comissao_min           NUMERIC NOT NULL DEFAULT 0.15,
  comissao_max           NUMERIC NOT NULL DEFAULT 0.30,
  comissao_media         NUMERIC NOT NULL DEFAULT 0.20,

  -- Fator de realização (o vazamento): parte das horas/km nunca chega à fatura.
  -- v1 manual (default 0.85). origem_fatores é o gancho para a conciliação de km
  -- (projeto seguinte) passar a alimentar uma média móvel sem mudar o schema.
  fator_realizacao_km    NUMERIC NOT NULL DEFAULT 0.85,
  fator_realizacao_horas NUMERIC NOT NULL DEFAULT 0.85,
  origem_fatores         TEXT NOT NULL DEFAULT 'manual'
                           CHECK (origem_fatores IN ('manual', 'conciliacao')),

  observacao             TEXT,
  criado_por             UUID,
  criado_em              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No máximo UMA vigência ativa (vigencia_fim IS NULL) por vez.
CREATE UNIQUE INDEX IF NOT EXISTS revisao_parametros_vigente_uq
  ON revisao_parametros ((true)) WHERE vigencia_fim IS NULL;

-- Seed idempotente: cria a 1ª vigência só se ainda não houver nenhuma ativa.
-- Todos os valores vêm dos DEFAULTs acima.
INSERT INTO revisao_parametros (vigencia_inicio)
SELECT CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM revisao_parametros WHERE vigencia_fim IS NULL);

-- ---------------------------------------------------------------------
-- 2. revisao_horas_padrao — horas de MO e pagador por kit
--
-- horas_kit = as 5 revisões DISTINTAS (50/300/600/900/1200); as demais (1500..
-- 3000) reaproveitam esses kits (ver kitDeHoras() no Gate 2).
-- horas_padrao = horas de mão de obra (a planilha guarda o VALOR já x R$200/h;
-- aqui guardamos HORAS: 400=>2h, 600=>3h, 1000=>5h — nunca o valor em reais).
-- pagador_padrao = quem paga a MO por padrão (a economia muda por pagador).
--
-- SEM SEED nesta migration: o seed autoritativo depende (a) da planilha
-- completa (só temos 2 prints parciais) e (b) da lista real de Cod_Trator da
-- tabela `revisoes` (que vive no Supabase). Semear com códigos/horas chutados
-- repetiria o defeito da planilha. Popular via a UI do Gate 3 ou por um seed
-- dedicado quando esses dois insumos estiverem à mão. Enquanto não houver linha,
-- o cálculo (Gate 2) aplica um horas_padrao default documentado.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revisao_horas_padrao (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cod_trator     TEXT NOT NULL,                 -- casa com revisoes.Cod_Trator
  horas_kit      INTEGER NOT NULL CHECK (horas_kit IN (50, 300, 600, 900, 1200)),
  horas_padrao   NUMERIC NOT NULL DEFAULT 0,    -- horas de MO
  pagador_padrao TEXT NOT NULL DEFAULT 'cliente'
                   CHECK (pagador_padrao IN ('cliente', 'fabrica', 'cortesia_loja')),
  observacao     TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cod_trator, horas_kit)
);

-- ---------------------------------------------------------------------
-- 3. revisao_margem_snapshot — congelamento mensal
--
-- Congela cada célula (modelo × kit) numa competência para comparação
-- histórica. parametros_id aponta para a vigência usada, tornando o número
-- reproduzível mesmo depois de mudar os parâmetros.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revisao_margem_snapshot (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competencia        DATE NOT NULL,                 -- 1º dia do mês
  cod_trator         TEXT NOT NULL,
  horas_kit          INTEGER NOT NULL CHECK (horas_kit IN (50, 300, 600, 900, 1200)),
  pagador            TEXT NOT NULL
                       CHECK (pagador IN ('cliente', 'fabrica', 'cortesia_loja')),

  -- Componentes calculados (todos já líquidos onde aplicável)
  pecas_venda        NUMERIC NOT NULL DEFAULT 0,
  pecas_custo        NUMERIC NOT NULL DEFAULT 0,
  margem_pecas       NUMERIC NOT NULL DEFAULT 0,
  receita_mo_liquida NUMERIC NOT NULL DEFAULT 0,
  comissao           NUMERIC NOT NULL DEFAULT 0,
  custo_mo           NUMERIC NOT NULL DEFAULT 0,
  margem_mo          NUMERIC NOT NULL DEFAULT 0,
  margem_nominal     NUMERIC NOT NULL DEFAULT 0,
  margem_realizada   NUMERIC NOT NULL DEFAULT 0,
  km_max             NUMERIC,                        -- NULL = ilimitado (km se paga sozinho)

  cobertura          NUMERIC NOT NULL DEFAULT 0,     -- 0..1 (itens com CMC>0 E preço>0 / total)
  origem_kit         TEXT NOT NULL DEFAULT 'proprio'
                       CHECK (origem_kit IN ('proprio', 'fallback_modelo', 'fallback_generico')),
  parametros_id      BIGINT REFERENCES revisao_parametros(id),
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competencia, cod_trator, horas_kit)
);

CREATE INDEX IF NOT EXISTS revisao_margem_snapshot_competencia_idx
  ON revisao_margem_snapshot (competencia DESC);

-- ---------------------------------------------------------------------
-- RLS — leitura pelo portal; escrita só service role (sem policies de escrita)
-- ---------------------------------------------------------------------
ALTER TABLE revisao_parametros      ENABLE ROW LEVEL SECURITY;
ALTER TABLE revisao_horas_padrao    ENABLE ROW LEVEL SECURITY;
ALTER TABLE revisao_margem_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS revisao_parametros_sel ON revisao_parametros;
CREATE POLICY revisao_parametros_sel ON revisao_parametros
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS revisao_horas_padrao_sel ON revisao_horas_padrao;
CREATE POLICY revisao_horas_padrao_sel ON revisao_horas_padrao
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS revisao_margem_snapshot_sel ON revisao_margem_snapshot;
CREATE POLICY revisao_margem_snapshot_sel ON revisao_margem_snapshot
  FOR SELECT TO authenticated USING (true);
