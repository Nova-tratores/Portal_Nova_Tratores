-- Sugestão de Compra — pedido_recebimento_vinculo.id_receb passa a ser NULLABLE.
--
-- Fatia 9: o recebimento do pedido é MANUAL (a nota de fornecedor não resolve
-- seus itens a produto — nCodProduto=0 em ~99%), então o vínculo registra a
-- quantidade recebida + a data de entrada SEM exigir uma nota específica. Quando
-- houver a NF, id_receb é preenchido (rastreabilidade). A UNIQUE trata NULLs como
-- distintos, então múltiplos recebimentos manuais do mesmo item convivem.
-- Idempotente. Executar no SQL Editor.

alter table public.pedido_recebimento_vinculo alter column id_receb drop not null;
