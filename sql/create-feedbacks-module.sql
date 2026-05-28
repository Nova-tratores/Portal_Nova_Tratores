-- =============================================================================
-- Módulo Feedbacks & CRM (migração do app standalone NT-FEEDBACKS-SITE).
--
-- Migra as 4 tabelas do Supabase legado kqsuznpywnmanrcougpv para este projeto
-- (citrhumdkfivdzbmayde), com prefixo `feedback_` para isolar do namespace.
--
-- Tabelas:
--  feedback_registros       — substitui `feedbacks` (CRM + RFM)
--  feedback_clientes_info   — substitui `clientes_info` (perfil estendido)
--  feedback_oportunidades   — nova (Fase 5: R1/R2/R3/R4 materializadas)
--  feedback_config_regras   — parâmetros configuráveis das 4 regras
--
-- cache_clientes e cache_projetos do app legado NÃO são migrados — eles são
-- substituídos pelas tabelas Clientes e Projeto que o Portal já mantém
-- via sync Omie (src/lib/pos/sync-omie.ts).
-- =============================================================================

-- Extensão para índice GIN trigram em nome (busca por similaridade)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- 1) feedback_registros — CRM + RFM
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_registros (
  id              BIGSERIAL PRIMARY KEY,
  tipo            TEXT NOT NULL CHECK (tipo IN ('crm','rfm')),

  -- comuns
  nome            TEXT NOT NULL,
  telefone        TEXT,
  email           TEXT,
  trator          TEXT,
  tecnico         TEXT,
  codigo_omie     TEXT,
  data_contato    DATE,

  -- CRM-only
  servico         TEXT,
  data_servico    DATE,
  status_cliente  TEXT,    -- Satisfeito | Neutro | Insatisfeito | Aguardando
  nota            INTEGER, -- 1..10
  feedback        TEXT,
  nps             TEXT,    -- Sim | Talvez | Não
  melhoria        TEXT,    -- Prazo | Atendimento | Preço | Qualidade Técnica

  -- RFM-only
  ultimo_servico       DATE,
  motivo               TEXT,
  prioridade           TEXT, -- Urgente | Normal | Inativo
  acao                 TEXT,
  sem_resposta         BOOLEAN NOT NULL DEFAULT false,
  revisao_confirmada   TEXT,
  tentativas           JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- formato: [{ data: ISO, canal: 'wpp'|'telefone'|'email', observacao: text }]

  -- Workflow de atendimento (registro criado a partir de oportunidade)
  atendente_id        TEXT,
  atendente_nome      TEXT,
  aberto_em           TIMESTAMPTZ,
  concluido_em        TIMESTAMPTZ,
  status_atendimento  TEXT NOT NULL DEFAULT 'concluido'
    CHECK (status_atendimento IN ('aberto','em_andamento','concluido','sem_resposta')),

  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_registros_tipo
  ON feedback_registros (tipo, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_registros_nome_trgm
  ON feedback_registros USING GIN (nome gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_feedback_registros_codigo_omie
  ON feedback_registros (codigo_omie)
  WHERE codigo_omie IS NOT NULL;

-- Indice pra consultas "meus atendimentos abertos"
CREATE INDEX IF NOT EXISTS idx_feedback_atendente_status
  ON feedback_registros (atendente_id, status_atendimento)
  WHERE status_atendimento IN ('aberto','em_andamento');

-- Indice pra alertar atendimentos parados ha +24h
CREATE INDEX IF NOT EXISTS idx_feedback_aberto_em
  ON feedback_registros (aberto_em)
  WHERE status_atendimento = 'aberto';

-- -----------------------------------------------------------------------------
-- 2) feedback_clientes_info — perfil estendido (funcionários, fazendas)
--
-- cliente_key é a chave canônica usada pelo app: 'omie_<codigo>' quando o
-- cliente vem do Omie, ou 'nome_<NOME_UPPER>' como fallback para clientes
-- soltos. Isso preserva comportamento da tabela legada `clientes_info`.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_clientes_info (
  id              BIGSERIAL PRIMARY KEY,
  cliente_key     TEXT NOT NULL UNIQUE,
  codigo_omie     TEXT,                                    -- redundante mas facilita JOIN com Clientes
  nome            TEXT,
  cidade          TEXT,
  email           TEXT,
  funcionarios    JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- formato: [{ nome, cargo, telefone, fazenda }]
  fazendas        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- formato: [{ nome, cidade, tratores: [string] }]
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_clientes_info_codigo_omie
  ON feedback_clientes_info (codigo_omie)
  WHERE codigo_omie IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3) feedback_oportunidades — snapshot recomputado diariamente (R1..R4)
--
-- O endpoint /api/feedbacks/oportunidades/recomputar roda 1x/dia (cron Railway
-- às 06:00 BRT) e faz upsert nesta tabela com a constraint UNIQUE
-- (regra, codigo_omie_norm, chassis_norm).
--
-- Comportamento esperado do upsert:
--   - oportunidade nova            → INSERT status='aberta'
--   - já existia e ainda válida    → mantém status (atendida/dispensada)
--   - existia e não é mais válida  → batch marca status='expirada'
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_oportunidades (
  id                   BIGSERIAL PRIMARY KEY,
  regra                TEXT NOT NULL,
  codigo_omie          TEXT,
  cliente_nome         TEXT NOT NULL,
  trator               TEXT,
  chassis              TEXT,
  detalhes             JSONB NOT NULL DEFAULT '{}'::jsonb,
  prioridade           TEXT NOT NULL DEFAULT 'Normal',     -- Urgente | Normal | Baixa
  status               TEXT NOT NULL DEFAULT 'aberta',     -- aberta | atendida | dispensada | expirada
  atendida_por         TEXT,                                -- user.id do auth.users
  atendida_em          TIMESTAMPTZ,
  feedback_id          BIGINT REFERENCES feedback_registros(id) ON DELETE SET NULL,
  dispensada_motivo    TEXT,
  computado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- chaves normalizadas (geradas) para constraint UNIQUE sem ambiguidade.
  -- Inclui cliente_nome para evitar colisão quando codigo_omie e chassis
  -- são ambos null (caso comum em R2 — oportunidade por cliente, não trator).
  codigo_omie_norm     TEXT GENERATED ALWAYS AS (COALESCE(codigo_omie, '')) STORED,
  chassis_norm         TEXT GENERATED ALWAYS AS (COALESCE(chassis, '')) STORED,
  cliente_nome_norm    TEXT GENERATED ALWAYS AS (upper(trim(cliente_nome))) STORED
);

ALTER TABLE feedback_oportunidades
  DROP CONSTRAINT IF EXISTS feedback_oportunidades_regra_check;
ALTER TABLE feedback_oportunidades
  ADD CONSTRAINT feedback_oportunidades_regra_check
  CHECK (regra IN ('R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas'));

ALTER TABLE feedback_oportunidades
  DROP CONSTRAINT IF EXISTS feedback_oportunidades_status_check;
ALTER TABLE feedback_oportunidades
  ADD CONSTRAINT feedback_oportunidades_status_check
  CHECK (status IN ('aberta','atendida','dispensada','expirada'));

ALTER TABLE feedback_oportunidades
  DROP CONSTRAINT IF EXISTS feedback_oportunidades_prioridade_check;
ALTER TABLE feedback_oportunidades
  ADD CONSTRAINT feedback_oportunidades_prioridade_check
  CHECK (prioridade IN ('Urgente','Normal','Baixa'));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_feedback_oportunidades_regra_chave
  ON feedback_oportunidades (regra, codigo_omie_norm, chassis_norm, cliente_nome_norm);

CREATE INDEX IF NOT EXISTS idx_feedback_oportunidades_status
  ON feedback_oportunidades (status, prioridade);

CREATE INDEX IF NOT EXISTS idx_feedback_oportunidades_regra_data
  ON feedback_oportunidades (regra, computado_em DESC);

-- -----------------------------------------------------------------------------
-- 4) feedback_config_regras — parâmetros configuráveis das regras
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_config_regras (
  regra           TEXT PRIMARY KEY,
  parametros      JSONB NOT NULL,
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE feedback_config_regras
  DROP CONSTRAINT IF EXISTS feedback_config_regras_regra_check;
ALTER TABLE feedback_config_regras
  ADD CONSTRAINT feedback_config_regras_regra_check
  CHECK (regra IN ('R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas'));

INSERT INTO feedback_config_regras (regra, parametros) VALUES
  ('R1_revisao',  '{"revisoes_alvo":[50,300,600],"dias_anteced":15}'::jsonb),
  ('R2_sem_os',   '{"min_dias_sem_os":90,"urgente_a_partir_de":5}'::jsonb),
  ('R3_upsell',   '{"min_meses_sem_pedido":12}'::jsonb),
  ('R4_followup', '{"dias_aniversario":30,"janela_dias":7}'::jsonb),
  ('R5_pecas',    '{"min_meses_sem_pedido":6}'::jsonb)
ON CONFLICT (regra) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5) RLS — policy permissiva (mesmo padrão das demais tabelas do Portal)
--
-- Acesso ao módulo é controlado em camada de app via portal_permissoes
-- (chave 'feedbacks' em modulos_permitidos).
-- -----------------------------------------------------------------------------
ALTER TABLE feedback_registros        ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_clientes_info    ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_oportunidades    ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_config_regras    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedback_registros_all     ON feedback_registros;
DROP POLICY IF EXISTS feedback_clientes_info_all ON feedback_clientes_info;
DROP POLICY IF EXISTS feedback_oportunidades_all ON feedback_oportunidades;
DROP POLICY IF EXISTS feedback_config_regras_all ON feedback_config_regras;

CREATE POLICY feedback_registros_all
  ON feedback_registros FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY feedback_clientes_info_all
  ON feedback_clientes_info FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY feedback_oportunidades_all
  ON feedback_oportunidades FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY feedback_config_regras_all
  ON feedback_config_regras FOR ALL USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 6) Trigger para manter atualizado_em automaticamente
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION feedback_touch_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feedback_registros_touch     ON feedback_registros;
DROP TRIGGER IF EXISTS trg_feedback_clientes_info_touch ON feedback_clientes_info;
DROP TRIGGER IF EXISTS trg_feedback_config_regras_touch ON feedback_config_regras;

CREATE TRIGGER trg_feedback_registros_touch
  BEFORE UPDATE ON feedback_registros
  FOR EACH ROW EXECUTE FUNCTION feedback_touch_atualizado_em();

CREATE TRIGGER trg_feedback_clientes_info_touch
  BEFORE UPDATE ON feedback_clientes_info
  FOR EACH ROW EXECUTE FUNCTION feedback_touch_atualizado_em();

CREATE TRIGGER trg_feedback_config_regras_touch
  BEFORE UPDATE ON feedback_config_regras
  FOR EACH ROW EXECUTE FUNCTION feedback_touch_atualizado_em();
