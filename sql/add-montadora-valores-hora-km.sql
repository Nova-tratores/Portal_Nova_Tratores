-- =============================================================================
-- Garantias — valor de hora e km PAGO PELA FÁBRICA, por montadora (09/09/2026).
-- Cada fábrica ressarce num valor próprio (ex.: Kuhn paga R$ 120,00/h e
-- R$ 1,50/km), diferente do que cobramos (R$ 193,00/h e R$ 2,80/km).
-- NULL = usa o padrão da empresa. Vale pro cálculo do que a fábrica paga
-- (finalizar/ressarcimento); a COBRANÇA AO CLIENTE segue sempre o padrão.
--
-- Aplicar manualmente no SQL editor do Supabase ANTES do deploy.
-- =============================================================================
ALTER TABLE garantia_montadoras ADD COLUMN IF NOT EXISTS valor_hora NUMERIC(10,2);
ALTER TABLE garantia_montadoras ADD COLUMN IF NOT EXISTS valor_km   NUMERIC(10,2);
