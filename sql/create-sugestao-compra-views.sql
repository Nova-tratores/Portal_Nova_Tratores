-- ============================================================================
-- Sugestão de compra — VIEWS (normais, não materializadas).
--
-- Consumidas só pelo job noturno (a tela lê o snapshot). View normal basta e
-- evita REFRESH/trava de concorrência. IMPORTANTE: view não escapa do teto de
-- 1000 linhas do PostgREST — o job PAGINA a leitura (ver src/lib/estoque/curva-abc.ts).
--
-- Divisão de responsabilidade (deliberada):
--   - A view entrega números AGREGADOS e testáveis em SQL puro.
--   - O julgamento fino fica no motor/job, onde é unit-testável:
--       * censura por "dias com saldo positivo" (precisa caminhar a série do
--         razão com interpolação entre movimentos);
--       * "aplicavel" do índice sazonal (pico/vale + concordância entre anos).
--
-- Idempotente. Executar no SQL Editor do Supabase APÓS create-sugestao-compra.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- vw_saida_mensal_item — demanda mensal por item (whitelist VEN) + saldo.
--
-- demanda = SUM(-qtde_saida) SÓ de VEN (balcão + OS faturada). qtde_saida é
-- NEGATIVO no razão, por isso o sinal trocado. cancelado=false, grupo='peca'.
-- saldo_fim/saldo_min vêm de TODOS os movimentos do mês (o saldo reflete tudo,
-- não só venda) — proxy barato p/ a censura; o cálculo exato de "dias com saldo
-- positivo" é feito no job a partir da série crua.
-- ----------------------------------------------------------------------------
create or replace view public.vw_saida_mensal_item as
with venda as (
  select conta_omie, codigo_produto, ano, mes,
         sum(-qtde_saida)      as demanda,
         count(*)              as n_movimentos
  from public.estoque_movimentos
  where grupo = 'peca'
    and cancelado = false
    and cod_origem = 'VEN'
  group by conta_omie, codigo_produto, ano, mes
),
saldo as (  -- último e menor saldo do mês, considerando TODOS os movimentos
  select distinct on (conta_omie, codigo_produto, ano, mes)
         conta_omie, codigo_produto, ano, mes,
         qtde_atual as saldo_fim
  from public.estoque_movimentos
  where grupo = 'peca' and cancelado = false
  order by conta_omie, codigo_produto, ano, mes, data desc
),
saldo_min as (
  select conta_omie, codigo_produto, ano, mes,
         min(qtde_atual) as saldo_min
  from public.estoque_movimentos
  where grupo = 'peca' and cancelado = false
  group by conta_omie, codigo_produto, ano, mes
)
select
  v.conta_omie, v.codigo_produto, v.ano, v.mes,
  v.demanda,
  v.n_movimentos,
  s.saldo_fim,
  sm.saldo_min
from venda v
left join saldo    s  using (conta_omie, codigo_produto, ano, mes)
left join saldo_min sm using (conta_omie, codigo_produto, ano, mes);

-- ----------------------------------------------------------------------------
-- vw_indice_sazonal_tipo — índice sazonal contínuo por (conta, Tipo, mês-calendário).
--
-- indice = média das saídas daquele mês-do-calendário ÷ média mensal geral do
-- Tipo, sobre todo o histórico (46 meses). "Tipo" vem de produto_tipo (manual);
-- item sem Tipo entra no bucket 'Sem tipo'. A APLICABILIDADE (pico/vale >= 1.5 e
-- anos concordam no pico) é decidida no job — a view expõe o índice cru e o
-- suporte (nº de meses-calendário observados) para o job julgar.
-- ----------------------------------------------------------------------------
create or replace view public.vw_indice_sazonal_tipo as
with base as (  -- saída mensal já agregada por Tipo
  select
    sm.conta_omie,
    coalesce(nullif(pt.tipo, ''), 'Sem tipo') as tipo,
    sm.mes,
    sm.demanda,
    sm.ano
  from public.vw_saida_mensal_item sm
  left join public.produto_tipo pt
    -- ⚠️ produto_tipo.conta_omie é MAIÚSCULO (NOVA/CASTRO); movimentos é minúsculo → upper().
    -- produto_tipo.codigo_produto é TEXT e casa com o bigint dos movimentos via ::text.
    on pt.conta_omie = upper(sm.conta_omie)
   and pt.codigo_produto = sm.codigo_produto::text
),
por_mes as (  -- média por mês-do-calendário do Tipo
  select conta_omie, tipo, mes,
         avg(demanda) as media_mes,
         count(distinct ano) as anos_observados
  from base
  group by conta_omie, tipo, mes
),
geral as (   -- média mensal geral do Tipo
  select conta_omie, tipo, avg(demanda) as media_geral
  from base
  group by conta_omie, tipo
)
select
  p.conta_omie,
  p.tipo,
  p.mes,
  p.media_mes,
  g.media_geral,
  case when g.media_geral > 0 then p.media_mes / g.media_geral else 1 end as indice,
  p.anos_observados
from por_mes p
join geral g using (conta_omie, tipo);

-- ----------------------------------------------------------------------------
-- vw_lead_time_realizado — lead time medido por fornecedor e por item.
--
-- De pedido_compra_item x pedido_recebimento_vinculo: dias entre a data do
-- pedido e a data REAL da entrada em estoque. Fica VAZIA até a Fatia 9 (enxerto
-- no recebimento) começar a gravar vínculos. Alimenta lead_time_usado a partir
-- de 8 entregas casadas (regra aplicada no motor).
-- ----------------------------------------------------------------------------
create or replace view public.vw_lead_time_realizado as
with entregas as (
  select
    pc.conta_omie,
    pc.codigo_fornecedor,
    pci.codigo_produto,
    (v.data_entrada_estoque - pc.data_pedido)::int as lead_dias
  from public.pedido_recebimento_vinculo v
  join public.pedido_compra_item pci on pci.id = v.pedido_item_id
  join public.pedido_compra pc       on pc.id = pci.pedido_id
  where v.data_entrada_estoque is not null
    and pc.data_pedido is not null
    and v.data_entrada_estoque >= pc.data_pedido
)
select
  conta_omie,
  codigo_fornecedor,
  codigo_produto,
  avg(lead_dias)::numeric      as lead_medio,
  stddev_samp(lead_dias)       as lead_sigma,
  count(*)::int                as entregas_medidas
from entregas
group by conta_omie, codigo_fornecedor, codigo_produto;
