-- Corrigir a NF-e de peças pelo portal (José, 15/10/2026): histórico das notas
-- canceladas do pedido (PPV) — motivo, quem, quando, pedido novo no Omie.
-- Sem esta coluna o botão responde "rode sql/ppv-refaturar.sql" e nada é cancelado.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS faturamento_anterior jsonb;
NOTIFY pgrst, 'reload schema';
