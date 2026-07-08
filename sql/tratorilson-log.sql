-- =====================================================================
-- Tratorilson — log de uso (observabilidade) + limite mensal de tokens
-- =====================================================================
-- tratorilson_log: uma linha por solicitação ao assistente (quem, o quê, tokens).
-- tratorilson_config: teto mensal de tokens (o painel mostra consumido vs restante).
-- Acesso só pelo servidor (service role); o painel /tratorilson lê via rota com
-- checagem de admin. RLS ligado sem políticas de cliente (default-deny).
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tratorilson_log (
  id         bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id    uuid,
  user_nome  text,
  tipo       text NOT NULL DEFAULT 'chat',
  pergunta   text,
  resposta   text,
  modelo     text,
  tokens     integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tratorilson_log_created ON tratorilson_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tratorilson_log_user    ON tratorilson_log (user_id);

ALTER TABLE tratorilson_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS tratorilson_config (
  id                int PRIMARY KEY DEFAULT 1,
  limite_tokens_mes bigint NOT NULL DEFAULT 0,   -- 0 = sem limite definido
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tratorilson_config_singleton CHECK (id = 1)
);
INSERT INTO tratorilson_config (id, limite_tokens_mes) VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE tratorilson_config ENABLE ROW LEVEL SECURITY;
