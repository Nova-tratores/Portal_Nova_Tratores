-- =====================================================================
-- FILA PESSOAL DE TICKETS (plano de trabalho por usuário)
-- Rodar manualmente no SQL Editor do Supabase.
--
-- Planejamento PESSOAL do responsável: a ordem em que pretende trabalhar
-- os tickets da sua fila e qual está "mexendo agora". Não é atividade do
-- ticket: não gera evento na timeline nem notificação, e não altera
-- ultima_atividade_em.
--
-- Acesso: leitura via RLS (cada um vê só o próprio plano);
-- escrita SÓ via /api/tickets/plano (service role), como o resto do módulo.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tickets_plano (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  posicao INTEGER NOT NULL DEFAULT 0,
  atual BOOLEAN NOT NULL DEFAULT FALSE,          -- "mexendo agora" (máx. 1 por usuário)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ticket_id)
);

-- No máximo UM ticket "atual" por usuário (índice único parcial).
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_plano_atual
  ON tickets_plano(user_id) WHERE atual;

CREATE INDEX IF NOT EXISTS idx_tickets_plano_user
  ON tickets_plano(user_id, posicao);

ALTER TABLE tickets_plano ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tickets_plano_select ON tickets_plano;
CREATE POLICY tickets_plano_select ON tickets_plano
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Sem policies de INSERT/UPDATE/DELETE: mutações só pelo service role.
