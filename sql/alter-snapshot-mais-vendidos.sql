-- Sugestão de Compra — colunas para a aba "Mais Vendidos" (grade 7×7).
--
-- qtd_12m = unidades vendidas nos últimos 12m (curva ABC quantidade, consolidado
-- NOVA+CASTRO). faturamento_12m = R$ vendido 12m (curva ABC valor_total). Ambos
-- vêm do calcularCurvaABC que o job já executa. Idempotente. Executar no SQL Editor.

alter table public.sugestao_compra_snapshot add column if not exists qtd_12m numeric;
alter table public.sugestao_compra_snapshot add column if not exists faturamento_12m numeric;
