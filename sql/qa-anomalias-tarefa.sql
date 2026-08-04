-- =============================================================================
-- qa_anomalias: sinalizacao de "enviado para correcao".
-- Quando uma anomalia do Monitor de Qualidade e' encaminhada como TAREFA
-- (/tarefas) para alguem corrigir, guardamos aqui o vinculo:
--   tarefa_id        -> portal_tarefas.id da tarefa criada (FK logica)
--   tarefa_criada_em -> quando foi encaminhada
-- A tela /dre-financeiro/monitor usa tarefa_id != null para mostrar o selo
-- "enviado para correcao" na linha e evitar reenvio.
--
-- APLICAR MANUALMENTE no Supabase (SQL Editor). qa_anomalias foi criada direto
-- no Supabase (sem .sql versionado), por isso este ALTER e' idempotente.
-- =============================================================================

ALTER TABLE qa_anomalias
  ADD COLUMN IF NOT EXISTS tarefa_id        INTEGER,      -- FK logica p/ portal_tarefas.id
  ADD COLUMN IF NOT EXISTS tarefa_criada_em TIMESTAMPTZ;

-- Consulta rapida das anomalias ja encaminhadas.
CREATE INDEX IF NOT EXISTS idx_qa_anomalias_tarefa ON qa_anomalias (tarefa_id)
  WHERE tarefa_id IS NOT NULL;
