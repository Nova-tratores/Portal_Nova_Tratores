-- Adicionar colunas lat/lng na tabela Clientes para o Mapeamento Tecnico
-- Executar no SQL Editor do Supabase

ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT '';
ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS razao_social TEXT DEFAULT '';
ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS nome_fantasia TEXT DEFAULT '';

-- Index para busca geografica
CREATE INDEX IF NOT EXISTS idx_clientes_lat_lng ON "Clientes" (lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;
