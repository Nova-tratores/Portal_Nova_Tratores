-- ============================================================================
-- RASTREIO × PPV — 14/08/2026
--
-- Unidades rastreadas agora podem ter DESTINO um PPV (pedido de venda de
-- peças): o scan na tela de liberação reserva a unidade pro PPV
-- (destino_tipo='ppv' + destino_ppv) e o faturamento aplica as liberadas.
--
-- Para instalação LIMPA basta o create-peca-unidades.sql (já atualizado).
-- Este ALTER é para ambientes onde o create antigo já rodou. Idempotente —
-- rodar os dois em sequência é seguro (este vira no-op).
-- ============================================================================

-- CHECK inline tem nome autogerado <tabela>_<coluna>_check
ALTER TABLE peca_unidades DROP CONSTRAINT IF EXISTS peca_unidades_destino_tipo_check;
ALTER TABLE peca_unidades ADD CONSTRAINT peca_unidades_destino_tipo_check
  CHECK (destino_tipo IN ('os', 'balcao', 'uso_interno', 'ppv'));

ALTER TABLE peca_unidades ADD COLUMN IF NOT EXISTS destino_ppv TEXT;
ALTER TABLE peca_unidades ADD COLUMN IF NOT EXISTS venda_preco NUMERIC;

CREATE INDEX IF NOT EXISTS idx_pu_destino_ppv ON peca_unidades(destino_ppv) WHERE destino_ppv IS NOT NULL;

NOTIFY pgrst, 'reload schema';
