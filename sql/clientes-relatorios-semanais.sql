-- Relatório semanal de "cards sem nota" (OS/PV faturados sem NF anexada).
-- Gerado toda sexta 08:00 BRT pelo cron clientes-relatorio-semanal.yml, que chama
-- /api/clientes/relatorio-semanal/gerar. Cada linha é a FOTO de uma semana.
-- Uma notificação (admins + módulo Clientes) avisa que o relatório ficou pronto.

create table if not exists clientes_relatorios_semanais (
  id           bigint generated always as identity primary key,
  semana       date not null unique,           -- a sexta-feira de referência (YYYY-MM-DD)
  gerado_em    timestamptz not null default now(),
  total_cards  integer not null default 0,
  total_valor  numeric  not null default 0,
  dados        jsonb    not null default '[]'::jsonb  -- [{ tipo:'OS'|'PV', numero, empresa, cliente, valor, data }]
);

comment on table clientes_relatorios_semanais is
  'Relatório semanal de OS/PV faturados sem NF — uma foto por semana (sexta).';

-- Leitura liberada pra quem está logado; a ESCRITA é só via service role (o gerador).
alter table clientes_relatorios_semanais enable row level security;

drop policy if exists "rel_semanais_ler" on clientes_relatorios_semanais;
create policy "rel_semanais_ler" on clientes_relatorios_semanais
  for select using (true);
