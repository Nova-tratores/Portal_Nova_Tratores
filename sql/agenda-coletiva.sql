-- ════════════════════════════════════════════════════════════════════
-- AGENDA COLETIVA (Central de Trabalho → Agenda) — compromissos estilo Google Agenda
-- Idempotente. Leitura: todo logado (a agenda é aberta para a empresa, sem "privado").
-- Escrita: só pela API (/api/agenda/*, service role).
-- O resto da agenda (reuniões, sala, prazos de tickets, OS do POS, Lousa) é lido
-- das tabelas de cada módulo — aqui ficam só os compromissos criados na agenda.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agenda_eventos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo       TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 200),
  descricao    TEXT CHECK (descricao IS NULL OR char_length(descricao) <= 4000),
  local        TEXT CHECK (local IS NULL OR char_length(local) <= 200),
  inicio       TIMESTAMPTZ NOT NULL,
  fim          TIMESTAMPTZ NOT NULL,
  dia_inteiro  BOOLEAN NOT NULL DEFAULT false,
  cor          TEXT,                         -- NULL = cor de quem criou
  -- {"freq":"diaria"|"dias_uteis"|"semanal"|"mensal","ate":"YYYY-MM-DD"|null}
  recorrencia  JSONB,
  excecoes     DATE[] NOT NULL DEFAULT '{}', -- ocorrências apagadas de uma série
  criado_por   UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelado_em TIMESTAMPTZ,
  CONSTRAINT agenda_eventos_periodo CHECK (fim > inicio)
);

CREATE INDEX IF NOT EXISTS idx_agenda_eventos_inicio ON agenda_eventos (inicio) WHERE cancelado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_agenda_eventos_recorrentes ON agenda_eventos (id) WHERE recorrencia IS NOT NULL AND cancelado_em IS NULL;

CREATE TABLE IF NOT EXISTS agenda_participantes (
  evento_id   UUID NOT NULL REFERENCES agenda_eventos(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  resposta    TEXT NOT NULL DEFAULT 'pendente' CHECK (resposta IN ('pendente', 'sim', 'nao', 'talvez')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_agenda_participantes_user ON agenda_participantes (user_id);

ALTER TABLE agenda_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_participantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_eventos_ler ON agenda_eventos;
CREATE POLICY agenda_eventos_ler ON agenda_eventos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS agenda_participantes_ler ON agenda_participantes;
CREATE POLICY agenda_participantes_ler ON agenda_participantes FOR SELECT TO authenticated USING (true);

REVOKE ALL ON agenda_eventos, agenda_participantes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON agenda_eventos, agenda_participantes FROM authenticated;

NOTIFY pgrst, 'reload schema';
