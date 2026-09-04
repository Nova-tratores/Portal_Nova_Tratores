-- ============================================================================
-- ENVIOS DE E-MAIL (relatórios automáticos/manuais) — configuração no BANCO,
-- editada na tela Dev → "Envios de e-mail" (/dev/envios-email), em vez de
-- variáveis no Railway.
--
--   email_envios_config : 1 linha por relatório (chave = id fixo no código,
--                         ex.: 'ppv_relacao', 'dre_lista'): ativo, destinatários,
--                         cc, bcc e parâmetros (jsonb, ex.: {"dias":7}).
--   email_envios_log    : histórico de cada disparo (cron/manual/teste), com
--                         resultado, destinatários e quem disparou.
--
-- RLS: NENHUMA policy de cliente. Todo acesso passa pelas rotas de API (service
-- role) que exigem Dev. Rodar no SQL Editor do Supabase (idempotente).
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_envios_config (
  chave           text PRIMARY KEY,
  ativo           boolean NOT NULL DEFAULT false,
  destinatarios   text[]  NOT NULL DEFAULT '{}',
  cc              text[]  NOT NULL DEFAULT '{}',
  bcc             text[]  NOT NULL DEFAULT '{}',
  parametros      jsonb   NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_por  text
);

CREATE TABLE IF NOT EXISTS email_envios_log (
  id             bigserial PRIMARY KEY,
  chave          text    NOT NULL,
  origem         text    NOT NULL,          -- 'cron' | 'manual' | 'teste'
  ok             boolean NOT NULL,
  motivo         text,                      -- motivo/erro quando ok=false (ou 'desativado', 'sem_destinatario')
  assunto        text,
  destinatarios  text[]  NOT NULL DEFAULT '{}',
  total          integer,                   -- registros no relatório
  detalhes       jsonb,
  usuario        text,                      -- quem disparou (manual/teste)
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_envios_log_chave_idx ON email_envios_log (chave, criado_em DESC);

ALTER TABLE email_envios_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_envios_log    ENABLE ROW LEVEL SECURITY;
-- Sem policies = anon/authenticated não leem nem escrevem. Só o service role.

-- Linhas iniciais (começam DESLIGADAS e sem destinatário — configurar na tela Dev).
INSERT INTO email_envios_config (chave, ativo, parametros) VALUES
  ('ppv_relacao', false, '{}'::jsonb),
  ('dre_lista',   false, '{"dias": 7}'::jsonb)
ON CONFLICT (chave) DO NOTHING;
