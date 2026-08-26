-- ============================================================================
-- Responsável pela CLASSIFICAÇÃO dos produtos recebidos (robô de recebidos).
--
-- Papel DIFERENTE do responsável do recebimento (recebimento_tipo_responsavel):
-- este é quem confirma família/localização/Tipo dos produtos novos (as tarefas
-- que o robô cria em /tarefas). Configurável por conta (1 update troca a pessoa).
--
-- Seed: Danilo Correa (função "Peças") p/ nova e castro.
-- Idempotente. Executar 1× no SQL Editor do Supabase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS recebimento_classificacao_responsavel (
  conta_omie          TEXT PRIMARY KEY,              -- minusculo: nova/castro
  responsavel_user_id UUID NOT NULL,                 -- financeiro_usu.id
  responsavel_nome    TEXT,
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO recebimento_classificacao_responsavel (conta_omie, responsavel_user_id, responsavel_nome) VALUES
  ('nova',   'ffab3b41-d8e6-4199-b77c-4ffa453d727e', 'Danilo Correa'),
  ('castro', 'ffab3b41-d8e6-4199-b77c-4ffa453d727e', 'Danilo Correa')
ON CONFLICT (conta_omie) DO UPDATE
  SET responsavel_user_id = EXCLUDED.responsavel_user_id,
      responsavel_nome    = EXCLUDED.responsavel_nome,
      atualizado_em       = NOW();
