-- ============================================================================
-- Responsavel por NF + mapa tipo->usuario + log interno de entradas
-- (tela /ajustes/recebimentos)
--
-- Complementa sql/recebimentos-migration.sql. Adiciona:
--   1) recebimento_meta.responsavel_user_id  -> usuario REAL do Portal (financeiro_usu.id)
--   2) recebimento_tipo_responsavel          -> mapa padrao tipo->usuario por conta
--   3) recebimento_entrada_log               -> log interno (dar entrada + correcao de CMC)
--
-- IMPORTANTE: conta_omie nestas tabelas e MINUSCULO ('nova'/'castro'), igual a
-- recebimento_meta / recebimentos_nfe. (No modulo /ajustes a Conta e MAIUSCULA;
-- as libs fazem a ponte com contaLow().)
--
-- Executar 1x no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- 1) recebimento_meta: vinculo com usuario real do Portal -----------------
ALTER TABLE recebimento_meta
  ADD COLUMN IF NOT EXISTS responsavel_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_receb_meta_resp_user
  ON recebimento_meta(responsavel_user_id);

-- 2) recebimento_tipo_responsavel: mapa padrao tipo->usuario ---------------
CREATE TABLE IF NOT EXISTS recebimento_tipo_responsavel (
  id                  BIGSERIAL PRIMARY KEY,
  conta_omie          TEXT NOT NULL,                 -- minusculo: nova/castro
  tipo                TEXT NOT NULL CHECK (tipo IN ('almoxarifado','maquinas','pecas','pecas_garantia')),
  responsavel_user_id UUID,                          -- financeiro_usu.id
  responsavel_nome    TEXT,                          -- denormalizado p/ exibicao
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recebimento_tipo_resp_conta_tipo_key UNIQUE (conta_omie, tipo)
);

DROP TRIGGER IF EXISTS trg_receb_tipo_resp_touch ON recebimento_tipo_responsavel;
CREATE TRIGGER trg_receb_tipo_resp_touch
  BEFORE UPDATE ON recebimento_tipo_responsavel
  FOR EACH ROW EXECUTE FUNCTION receb_touch_updated_at();

-- 3) recebimento_entrada_log: log interno das acoes desta tela -------------
CREATE TABLE IF NOT EXISTS recebimento_entrada_log (
  id          BIGSERIAL PRIMARY KEY,
  conta_omie  TEXT NOT NULL,                          -- minusculo: nova/castro
  id_receb    BIGINT,                                 -- = recebimentos_nfe.id_receb
  numero_nfe  TEXT,
  tipo        TEXT,
  acao        TEXT NOT NULL CHECK (acao IN ('dar_entrada','correcao_cmc')),
  user_id     UUID,                                   -- financeiro_usu.id (quem executou)
  user_nome   TEXT,
  payload     JSONB,
  resultado   JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receb_entrada_log_conta_receb
  ON recebimento_entrada_log(conta_omie, id_receb);
CREATE INDEX IF NOT EXISTS idx_receb_entrada_log_created
  ON recebimento_entrada_log(created_at DESC);

-- ----------------------------------------------------------------------------
-- Cadastro do mapa padrao (EDITE os UUIDs/nomes conforme seus usuarios).
-- Pegue os ids em: select id, nome, funcao from financeiro_usu where ativo;
-- Exemplo (comentado): repita por conta ('nova' e 'castro').
-- ----------------------------------------------------------------------------
-- INSERT INTO recebimento_tipo_responsavel (conta_omie, tipo, responsavel_user_id, responsavel_nome) VALUES
--   ('nova','pecas',          '<uuid>', '<nome>'),
--   ('nova','pecas_garantia', '<uuid>', '<nome>'),
--   ('nova','almoxarifado',   '<uuid>', '<nome>'),
--   ('nova','maquinas',       '<uuid>', '<nome>')
-- ON CONFLICT (conta_omie, tipo) DO UPDATE
--   SET responsavel_user_id = EXCLUDED.responsavel_user_id,
--       responsavel_nome    = EXCLUDED.responsavel_nome;
