-- Supervisor Vendas: guarda, junto da rota do dia, as visitas feitas a até 2km
-- de alguma parada do carro (cruzamento rota × visitas, pro histórico).
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS visitas JSONB DEFAULT '[]'::jsonb;
NOTIFY pgrst, 'reload schema';
