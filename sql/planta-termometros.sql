-- =====================================================================
-- Planta Viva — termômetros por número (21/10/2026)
-- Pedido: comparar cada número com a média da semana, do mês e do ano e com
-- uma meta definida à mão. Decisões do usuário: só admin define meta; UMA meta
-- por número (vale para a visão "Todas"); histórico começa do zero.
--
--   planta_kpi_dia   1 linha por (número, empresa, dia) = o último valor do dia,
--                    gravada pelo worker a cada rodada (upsert). ~16 mil linhas/ano.
--   planta_metas     a meta de cada número (só admin, pela rota /api/planta/metas;
--                    cada mudança vai para o audit_log com de → para).
--   planta_kpi.medias  médias de 7/30/365 dias fechados, calculadas pelo worker
--                    uma vez por dia (jsonb).
--
-- Sem esta migration nada quebra: o worker só não grava o histórico e a tela
-- não mostra termômetro. Fechada ao navegador (RLS sem policy + REVOKE). Idempotente.
-- =====================================================================

create table if not exists planta_kpi_dia (
  kpi_id     text    not null,
  conta      text    not null check (conta in ('NOVA', 'CASTRO', 'TODAS')),
  dia        date    not null,              -- dia em Brasília
  contagem   integer not null default 0,
  valor      numeric,
  gravado_em timestamptz not null default now(),
  primary key (kpi_id, conta, dia)
);
create index if not exists planta_kpi_dia_dia_idx on planta_kpi_dia (dia);

create table if not exists planta_metas (
  kpi_id         text primary key,
  meta           numeric not null,          -- na medida principal do número (R$ quando tem valor; senão a contagem)
  tolerancia_pct numeric not null default 10 check (tolerancia_pct >= 0 and tolerancia_pct <= 100),
  atualizado_por text,
  atualizado_em  timestamptz not null default now()
);

alter table planta_kpi add column if not exists medias jsonb not null default '{}'::jsonb;

alter table planta_kpi_dia enable row level security;
alter table planta_metas enable row level security;
revoke all on planta_kpi_dia from anon, authenticated;
revoke all on planta_metas from anon, authenticated;

notify pgrst, 'reload schema';

-- Conferência:
--   select count(*) from planta_kpi_dia;   -- cresce a cada rodada do dia de hoje
--   select * from planta_metas;
