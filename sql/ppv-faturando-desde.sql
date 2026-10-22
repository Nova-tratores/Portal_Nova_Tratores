-- Trava do faturamento do PPV (22/10/2026, item 9 de docs/omie-otimizacao-pos-ppv.md) — projeto do PORTAL
-- (citrhumdkfivdzbmayde). Só um faturamento por pedido por vez (lease de 10 min); sem a coluna o portal
-- fatura sem a trava, como antes.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS faturando_desde timestamptz;
NOTIFY pgrst, 'reload schema';
