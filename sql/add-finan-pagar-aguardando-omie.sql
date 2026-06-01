-- =============================================================================
-- Nova fase 'aguardando_omie' em finan_pagar — entre 'financeiro' e 'concluido'.
-- Pós-Vendas precisa enviar a conta pro Omie antes do ciclo ser dado como
-- concluído. Antes, financeiro arrastava pra 'concluido' sem garantir
-- que a conta a pagar tinha sido criada no Omie.
-- =============================================================================

-- Timestamp de quando entrou em 'aguardando_omie'.
-- Usado pra disparar alerta de "X dias parado" no home-posvendas.
ALTER TABLE finan_pagar
  ADD COLUMN IF NOT EXISTS aguardando_omie_desde TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_finan_pagar_aguardando_omie
  ON finan_pagar(aguardando_omie_desde)
  WHERE status = 'aguardando_omie';
