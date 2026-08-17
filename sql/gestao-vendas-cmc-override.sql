-- Gestão de Vendas — CMC corrigível manualmente na tela "Ajustes por Venda".
-- Alguns CMCs vêm errados do sync (ex.: máquina de R$260k com CMC R$3.500,
-- porque o item casou com um SKU genérico em vez da unidade serializada).
-- Esta coluna guarda o CMC TOTAL corrigido à mão; NULL = usar o snapshot
-- (vendas_itens.cmc_unitario * quantidade). O servidor recalcula margem/comissão
-- a partir do valor efetivo (override quando presente, senão snapshot).
--
-- Idempotente. Aplicar no Supabase (SQL editor) uma vez.

alter table public.comissao_ajustes_vendas
  add column if not exists cmc_override numeric;

comment on column public.comissao_ajustes_vendas.cmc_override is
  'CMC total corrigido manualmente na tela de Ajustes por Venda. NULL = usar o CMC do snapshot (vendas_itens.cmc_unitario * qtd).';
