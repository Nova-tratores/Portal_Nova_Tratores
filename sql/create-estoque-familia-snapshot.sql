-- Snapshot mensal do valor de estoque por família (conta + ano + mês).
-- Alimenta o gráfico mensal do "Cruzamento por Família": como NÃO há histórico
-- de saldo na Omie, congelamos o valor atual de estoque (por família) a cada
-- captura. O cron de estoque grava/atualiza o mês corrente; quando o mês vira,
-- a última captura daquele mês fica como o "fim de mês".
--
-- conta_omie em MINÚSCULO ('nova'/'castro'), igual à tabela `produtos`.
-- Aplicar no SQL editor do Supabase (idempotente).

create table if not exists public.estoque_familia_snapshot (
  conta_omie     text        not null,
  ano            int         not null,
  mes            int         not null,
  familia        text        not null,
  estoque_qtd    numeric     not null default 0,
  estoque_valor  numeric     not null default 0,
  atualizado_em  timestamptz not null default now(),
  primary key (conta_omie, ano, mes, familia)
);

create index if not exists idx_estoque_familia_snapshot_periodo
  on public.estoque_familia_snapshot (ano, mes, conta_omie);
