-- =============================================================================
-- Memória aprendida do Tratorilson (assistente IA).
-- A equipe "ensina" regras/fatos pelo próprio chat; ficam guardados aqui e são
-- injetados no prompt do assistente em toda conversa. Pode atualizar e desativar.
-- Rode este SQL uma vez no editor SQL do Supabase.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tratorilson_memoria (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conteudo    TEXT NOT NULL,
  criado_por  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ativo       BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_tratorilson_memoria_ativo ON tratorilson_memoria(ativo);
