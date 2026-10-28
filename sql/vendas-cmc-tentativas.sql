-- Backfill de CMC: tentativas por item sem custo — 28/10/2026.
-- Projeto Supabase do PORTAL (citrhumdk…). Idempotente.
--
-- O job estoque-backfill-cmc levava 45 min todo dia sem resolver nada: os ~560 pares
-- produto+data em que a Omie devolve custo 0 (venda com o produto sem saldo naquela
-- data, quase todos de 2022–2024) voltavam para a fila na hora, o laço girava 40
-- vezes sobre os mesmos 100 e os outros nunca eram tentados.
--
-- Agora cada par é tentado uma vez por rodada; o que vier sem custo espera 1, 7 e 30
-- dias e, na 4ª tentativa, fica como 'sem_custo_omie' (proxima_em null) e para de ser
-- consultado. Achou o custo → a linha daqui é apagada. Erro de chamada não conta.
-- Tabela separada porque o vendas-sync regrava vendas_itens. Sem ela o job ainda roda
-- (uma vez por par por rodada), só sem lembrar das tentativas.

create table if not exists vendas_cmc_tentativas (
  conta_omie       text not null,            -- NOVA | CASTRO (como em vendas_itens)
  codigo_produto   text not null,
  data_pedido      text not null,            -- DD/MM/YYYY, igual a vendas_itens
  tentativas       int  not null default 0,  -- consultas que vieram sem custo
  proxima_em       timestamptz,              -- null = desistiu
  ultimo_resultado text,                     -- sem_custo | sem_custo_omie | erro
  atualizado_em    timestamptz not null default now(),
  primary key (conta_omie, codigo_produto, data_pedido)
);

alter table vendas_cmc_tentativas enable row level security;
revoke all on vendas_cmc_tentativas from anon, authenticated;

notify pgrst, 'reload schema';
