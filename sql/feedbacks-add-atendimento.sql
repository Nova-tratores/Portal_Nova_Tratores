-- =============================================================================
-- Migration: campos de atendimento em feedback_registros.
--
-- Workflow novo:
--   1. Usuario clica "Atender" em oportunidade → cria feedback_registros minimo
--      com atendente_id/nome e aberto_em = now(). Status_atendimento = 'aberto'.
--   2. Usuario passa pra proxima oportunidade sem perder tempo preenchendo.
--   3. Apos 24h o cliente respondeu? Atendente atualiza o registro com detalhes
--      e marca concluido. Se nao respondeu, marca como sem_resposta.
--   4. Antes de 24h, o botao "sem_resposta" fica bloqueado na UI.
-- =============================================================================

ALTER TABLE feedback_registros
  ADD COLUMN IF NOT EXISTS atendente_id        TEXT,
  ADD COLUMN IF NOT EXISTS atendente_nome      TEXT,
  ADD COLUMN IF NOT EXISTS aberto_em           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS concluido_em        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_atendimento  TEXT NOT NULL DEFAULT 'concluido';

-- 'aberto'      → recem-criado a partir de oportunidade, sem detalhes ainda
-- 'em_andamento' → atendente esta preenchendo
-- 'concluido'   → preenchido com detalhes (status padrao pra registros legados/manuais)
-- 'sem_resposta' → cliente nao retornou apos 24h (so liberado apos esse prazo)
ALTER TABLE feedback_registros
  DROP CONSTRAINT IF EXISTS feedback_registros_status_atendimento_check;
ALTER TABLE feedback_registros
  ADD CONSTRAINT feedback_registros_status_atendimento_check
  CHECK (status_atendimento IN ('aberto','em_andamento','concluido','sem_resposta'));

-- Indice pra consultas tipo "meus atendimentos abertos"
CREATE INDEX IF NOT EXISTS idx_feedback_atendente_status
  ON feedback_registros (atendente_id, status_atendimento)
  WHERE status_atendimento IN ('aberto','em_andamento');

-- Indice pra alertar "atendimentos abertos ha +24h"
CREATE INDEX IF NOT EXISTS idx_feedback_aberto_em
  ON feedback_registros (aberto_em)
  WHERE status_atendimento = 'aberto';
