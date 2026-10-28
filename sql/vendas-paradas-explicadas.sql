-- Paradas longas do carro do vendedor explicadas por ele (22/10/2026).
-- Parada de 30 min ou mais sem visita registrada perto vira "a explicar" no app
-- de vendas; o vendedor toca o motivo. Nada vira visita sozinho. O supervisor
-- vê o motivo (ou "sem explicação") na timeline do mapa do CRM.
-- Escrita e leitura só pelo portal (/api/crm-vendas/paradas, service role).
create table if not exists public.vendas_paradas_explicadas (
  id bigserial primary key,
  placa text not null,
  inicio timestamptz not null,           -- início da parada (chave junto com a placa)
  fim timestamptz,
  duracao_min integer,
  lat double precision,
  lng double precision,
  vendedor_id integer,
  motivo text not null check (motivo in ('visita', 'almoco', 'oficina', 'abastecimento', 'pessoal', 'outro')),
  observacao text,
  explicado_em timestamptz not null default now(),
  unique (placa, inicio)
);
create index if not exists vendas_paradas_explicadas_vendedor on public.vendas_paradas_explicadas (vendedor_id, inicio);
alter table public.vendas_paradas_explicadas enable row level security;
revoke all on public.vendas_paradas_explicadas from anon, authenticated;
notify pgrst, 'reload schema';
