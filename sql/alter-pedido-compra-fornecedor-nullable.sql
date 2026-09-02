-- Sugestão de Compra — pedido_compra.codigo_fornecedor passa a ser NULLABLE.
--
-- Na v1 o fornecedor preferencial ainda não é atribuído (o backfill de
-- produtos.ultima_entrada_fornecedor foi deferido), então um pedido pode nascer
-- "sem fornecedor definido" (grupo "Não definido" na tela). O valor é chaveado
-- por Fornecedores.id quando existe. Idempotente. Executar no SQL Editor.

alter table public.pedido_compra alter column codigo_fornecedor drop not null;
