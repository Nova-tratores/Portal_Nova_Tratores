-- Descontos do Omie no Centro do Pós-Vendas (José, 21/10/2026: "os descontos estão desatualizados, precisa pegar todos").
-- O espelho dos itens já gravava o valor DEPOIS do desconto, mas jogava fora quanto foi o desconto.
-- Agora guarda o desconto de cada item da OS (nValorDesconto) e de cada item do pedido de peças (valor_desconto).
ALTER TABLE public.os_servicos_itens ADD COLUMN IF NOT EXISTS valor_desconto numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.vendas_itens ADD COLUMN IF NOT EXISTS valor_desconto numeric(12,2) NOT NULL DEFAULT 0;
NOTIFY pgrst, 'reload schema';
