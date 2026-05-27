-- =============================================================================
-- Cobrança ao cliente quando a garantia é rejeitada pela fábrica.
-- O garantista escolhe via checklist o que cobrar (horas/km/peças específicas)
-- e dá baixa quando o cliente paga ou marca como prejuízo se não pagar.
-- =============================================================================

ALTER TABLE garantias
  ADD COLUMN IF NOT EXISTS cobranca_status TEXT NOT NULL DEFAULT 'nao_aplicavel',
  ADD COLUMN IF NOT EXISTS cobranca_itens  JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cobranca_valor_total NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cobranca_outros JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cobranca_vencimento DATE,
  ADD COLUMN IF NOT EXISTS cobranca_cobrada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cobranca_pago_em    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cobranca_baixada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cobranca_obs        TEXT;

-- Estados:
--  nao_aplicavel    → garantia não rejeitada (default)
--  nao_cobrar       → garantista decidiu não cobrar (cortesia)
--  pendente         → rejeitada, garantista ainda não definiu cobrança
--  cobrada          → cobrança definida, aguardando pagamento
--  paga             → cliente pagou
--  baixada_prejuizo → cobrança não foi paga, assumida como prejuízo
ALTER TABLE garantias
  DROP CONSTRAINT IF EXISTS garantias_cobranca_status_check;
ALTER TABLE garantias
  ADD CONSTRAINT garantias_cobranca_status_check
  CHECK (cobranca_status IN ('nao_aplicavel','nao_cobrar','pendente','cobrada','paga','baixada_prejuizo'));

-- Quando garantia for rejeitada e cobrança ainda nao_aplicavel, vira pendente.
-- (Aplica-se a registros já rejeitados antes desta migration.)
UPDATE garantias
   SET cobranca_status = 'pendente'
 WHERE status = 'rejeitada' AND cobranca_status = 'nao_aplicavel';

CREATE INDEX IF NOT EXISTS idx_garantias_cobranca_status ON garantias(cobranca_status);
CREATE INDEX IF NOT EXISTS idx_garantias_cobranca_venc   ON garantias(cobranca_vencimento)
  WHERE cobranca_status = 'cobrada';
