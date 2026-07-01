-- Snapshot mensal do valor de estoque por "Tipo" (característica de Peças).
-- Alimenta a aba "Estoque por Tipo" do "Cruzamento por Família": como NÃO há
-- histórico de saldo na Omie, congelamos o valor atual de estoque (por Tipo) a
-- cada captura. O cron de estoque grava/atualiza o mês corrente; quando o mês
-- vira, a última captura daquele mês fica como o "fim de mês". O histórico real
-- é semeado pelo backfill (posição-por-data na Omie), igual ao snapshot de família.
--
-- "Tipo" vem da tabela produto_tipo (classificação manual: Anel, Filtros…), só
-- para produtos da família Peças; sem Tipo → bucket "Sem tipo".
-- conta_omie em MINÚSCULO ('nova'/'castro'), igual à tabela `produtos`.
-- Aplicar no SQL editor do Supabase (idempotente).

create table if not exists public.estoque_tipo_snapshot (
  conta_omie     text        not null,
  ano            int         not null,
  mes            int         not null,
  tipo           text        not null,
  estoque_qtd    numeric     not null default 0,
  estoque_valor  numeric     not null default 0,
  atualizado_em  timestamptz not null default now(),
  primary key (conta_omie, ano, mes, tipo)
);

create index if not exists idx_estoque_tipo_snapshot_periodo
  on public.estoque_tipo_snapshot (ano, mes, conta_omie);
