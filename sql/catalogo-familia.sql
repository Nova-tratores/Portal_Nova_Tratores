-- Família (linha de produto) do modelo: agrupa as variantes num card só no catálogo.
-- Ex.: "PST DUO" tem 62 variantes (por chassi/versão); "KAPINA CITRUS" tem 3.
-- Quando fica nula, o modelo vale por si (o próprio nome é a família).
ALTER TABLE catalogo_modelos ADD COLUMN IF NOT EXISTS familia text;
CREATE INDEX IF NOT EXISTS catalogo_modelos_familia_idx ON catalogo_modelos (familia);
