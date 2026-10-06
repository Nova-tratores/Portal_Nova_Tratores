-- ============================================================================
-- Localização física da peça de garantia nas estantes da oficina (06/10/2026)
--
-- Esquema das estantes (foto do José): MAHINDRA 1, MAHINDRA 2, VENTURA, KUHN,
-- OUTRAS; prateleiras contadas de cima pra baixo. O portal grava um código
-- compacto ("MA1-P2" = estante MAHINDRA 1, prateleira 2) e imprime o rótulo
-- humano na etiqueta do QR code colada na caixa da peça.
--
-- Idempotente — pode rodar mais de uma vez.
-- ============================================================================

ALTER TABLE garantias ADD COLUMN IF NOT EXISTS localizacao text;

COMMENT ON COLUMN garantias.localizacao IS
  'Onde a peça está guardada: código estante-prateleira (ex. MA1-P2 = MAHINDRA 1, prateleira 2). Texto livre de propósito — ver src/lib/garantias/localizacao.ts';
