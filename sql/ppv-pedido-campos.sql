-- Campos do Pedido de Venda (PPV) que passam a ser SALVOS no `pedidos` (antes
-- eram só estado local): Informações Adicionais, previsão, parcelas e a
-- distribuição de departamentos. Assim o histórico registra as mudanças deles.
-- Rodar no Supabase (idempotente).

alter table pedidos add column if not exists categoria_pedido      text;
alter table pedidos add column if not exists conta_corrente        text;
alter table pedidos add column if not exists etapa                 text;
alter table pedidos add column if not exists cenario_fiscal        text;
alter table pedidos add column if not exists previsao_faturamento  date;
alter table pedidos add column if not exists num_parcelas          text;
alter table pedidos add column if not exists num_contrato          text;
alter table pedidos add column if not exists contato               text;
alter table pedidos add column if not exists dados_nf              text;
alter table pedidos add column if not exists consumo_final         boolean default false;
alter table pedidos add column if not exists departamentos         jsonb;   -- [{codigo, perc}]
alter table pedidos add column if not exists parcelas              jsonb;   -- [{vencimento, valor, percentual}]
