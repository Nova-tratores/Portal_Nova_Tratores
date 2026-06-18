-- Supervisor Vendas: classificar carro (comercial/oficina) + métricas de rota.

-- categoria do carro: 'comercial' (mostra no mapa) ou 'oficina'
ALTER TABLE comercial_veiculos ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'comercial';
-- pessoa_id pode ficar vazio (carro classificado sem vínculo de pessoa)
ALTER TABLE comercial_veiculos ALTER COLUMN pessoa_id DROP NOT NULL;

-- Tempo dirigindo / parado por dia (histórico)
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS tempo_dirigindo_min INTEGER DEFAULT 0;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS tempo_parado_min INTEGER DEFAULT 0;

NOTIFY pgrst, 'reload schema';
