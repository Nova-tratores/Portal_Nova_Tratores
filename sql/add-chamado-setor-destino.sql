-- Setor de destino do faturamento: 'oficina' (Pós-Vendas) ou 'pecas' (Peças Balcão)
-- A regra: se a Categoria do Pedido de Venda no Omie = '10. @Revenda de Peças Balcão' → 'pecas'.
ALTER TABLE "Chamado_NF" ADD COLUMN IF NOT EXISTS setor_destino TEXT DEFAULT 'oficina';

-- Garante valor nos registros existentes (todos viram Oficina/Pós-Vendas)
UPDATE "Chamado_NF" SET setor_destino = 'oficina' WHERE setor_destino IS NULL;

NOTIFY pgrst, 'reload schema';
