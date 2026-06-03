-- =============================================================================
-- Recusa interna pelo garantista (sem mandar pra fábrica).
-- Antes só dava pra rejeitar via fluxo enviada → rejeitada (fábrica avaliando).
-- Agora o garantista pode recusar direto em 'em_analise' quando já vê que
-- o caso não cabe garantia.
--
-- recusado_por:
--   'garantista' → recusa interna (garantista viu, não cabe garantia)
--   'fabrica'    → recusa veio do retorno da fábrica
--   NULL         → não rejeitada (aprovada ou ainda em andamento)
-- =============================================================================

ALTER TABLE garantias
  ADD COLUMN IF NOT EXISTS recusado_por TEXT;

ALTER TABLE garantias
  DROP CONSTRAINT IF EXISTS garantias_recusado_por_check;
ALTER TABLE garantias
  ADD CONSTRAINT garantias_recusado_por_check
  CHECK (recusado_por IS NULL OR recusado_por IN ('garantista','fabrica'));

-- Backfill: rejeitadas pré-existentes vieram do fluxo da fábrica.
UPDATE garantias
   SET recusado_por = 'fabrica'
 WHERE status = 'rejeitada' AND recusado_por IS NULL;

CREATE INDEX IF NOT EXISTS idx_garantias_recusado_por
  ON garantias(recusado_por)
  WHERE recusado_por IS NOT NULL;
