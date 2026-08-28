-- Frota — grau de perigo da pendência + desligar o checklist de um veículo.
-- Rodar no SQL Editor do Supabase. É idempotente (pode rodar de novo sem dano).
--
-- CONTEXTO
-- 1) Pendências não tinham grau de perigo: um farol queimado contava igual a
--    uma falha de direção. O carro com sete itens leves parecia pior que o
--    carro com um item que mata.
-- 2) O checklist mensal aparecia até em carro vendido/inativo, e não havia como
--    desligá-lo num carro específico (ex.: veículo parado no pátio).
--
-- ONDE MORA O PADRÃO: a gravidade SUGERIDA por componente NÃO é coluna — vive
-- em src/lib/frota/gravidade.ts, versionada e com teste. Aqui fica só o que a
-- pessoa decidiu na pendência concreta. Pendência sem gravidade gravada (todas
-- as antigas) segue o padrão do componente na leitura, então NÃO precisa de
-- backfill.

-- ── 1. gravidade da pendência ───────────────────────────────────────────────
alter table frota_pendencias
  add column if not exists gravidade text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'frota_pendencias_gravidade_ck'
  ) then
    alter table frota_pendencias
      add constraint frota_pendencias_gravidade_ck
      check (gravidade is null or gravidade in ('leve', 'media', 'grave', 'critica'));
  end if;
end $$;

comment on column frota_pendencias.gravidade is
  'leve|media|grave|critica. NULL = usar o padrão do componente (lib/frota/gravidade.ts).';

-- lista "o que é perigoso na frota" sem varrer a tabela toda
create index if not exists idx_frota_pendencias_gravidade
  on frota_pendencias (gravidade) where status = 'aberta';

-- ── 2. desligar o checklist de um veículo ───────────────────────────────────
alter table frota_veiculos
  add column if not exists checklist_desativado boolean not null default false,
  add column if not exists checklist_desativado_motivo text,
  add column if not exists checklist_desativado_em timestamptz,
  add column if not exists checklist_desativado_por text;

comment on column frota_veiculos.checklist_desativado is
  'Checklist mensal desligado À MÃO neste veículo. Carro inativo/vendido já não '
  'pede checklist por causa de frota_veiculos.ativo/status — esta coluna é para '
  'o carro que continua ativo mas não deve entrar na rotina (ex.: parado no pátio).';

-- Conferência:
--   select count(*) filter (where gravidade is not null) as classificadas,
--          count(*) as total_pendencias
--     from frota_pendencias;
--   select placa, checklist_desativado from frota_veiculos where checklist_desativado;
