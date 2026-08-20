-- ============================================================================
-- Índice para leitura "snapshot mais recente por conta" (lerSnapshotAtual):
-- ORDER BY gerado_em DESC filtrando por conta_omie. Usado pela janela grande
-- (01/11/2022→hoje) com atualização incremental diária.
-- Idempotente. Executar 1× no SQL Editor do Supabase.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_receb_pend_cache_conta_gerado
  ON recebimento_pendentes_cache (conta_omie, gerado_em DESC);
