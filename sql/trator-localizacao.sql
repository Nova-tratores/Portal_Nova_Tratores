-- Localização dos tratores vendidos, confirmada pelo vendedor em campo (22/10/2026).
-- A tabela `tratores` (controle de revisões) só tem a cidade em texto livre.
-- Na visita a um cliente que tem trator nosso, o app de vendas pergunta
-- "o trator CHASSI X está nesta propriedade?" e grava uma linha aqui com o GPS
-- da hora. O banco descobre sozinho em que imóvel do CAR o ponto caiu.
-- Uma linha por confirmação (histórico); a posição atual = a mais recente com
-- resposta 'aqui' (view trator_localizacao_atual). Idempotente.
create table if not exists public.trator_localizacao (
  id bigserial primary key,
  chassis text not null,
  resposta text not null check (resposta in ('aqui', 'nao_esta', 'nao_e_mais_dele')),
  propriedade_id bigint,
  visita_uuid uuid,                -- client_uuid da visita em que foi confirmado
  lat double precision,
  lng double precision,
  gps_precisao_m double precision,
  cod_car text,                    -- preenchido pelo banco (ponto dentro do imóvel do CAR)
  vendedor_id integer,
  vendedor_nome text,
  observacao text,
  confirmado_em timestamptz not null default now()
);
create index if not exists trator_localizacao_chassis on public.trator_localizacao (chassis, confirmado_em desc);
create index if not exists trator_localizacao_car on public.trator_localizacao (cod_car);

-- imóvel do CAR que contém o ponto (só imóveis ativos)
create or replace function public.trator_localizacao_car()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.lat is not null and new.lng is not null and new.resposta = 'aqui' then
    select i.cod_car into new.cod_car
      from public.agro_car_imovel i
     where i.status_car = 'AT'
       and ST_Contains(i.geom, ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4674))
     order by i.area_ha asc nulls last  -- sobreposição: fica o imóvel menor (mais específico)
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trator_localizacao_car on public.trator_localizacao;
create trigger trg_trator_localizacao_car
  before insert on public.trator_localizacao
  for each row execute function public.trator_localizacao_car();

-- posição atual de cada trator (última confirmação "está aqui")
create or replace view public.trator_localizacao_atual
with (security_invoker = true) as
select distinct on (chassis) *
  from public.trator_localizacao
 where resposta = 'aqui'
 order by chassis, confirmado_em desc;

alter table public.trator_localizacao enable row level security;
revoke all on public.trator_localizacao from anon;
revoke all on public.trator_localizacao_atual from anon;
grant select, insert on public.trator_localizacao to authenticated;
grant select on public.trator_localizacao_atual to authenticated;
grant usage, select on sequence public.trator_localizacao_id_seq to authenticated;

drop policy if exists trator_localizacao_ler on public.trator_localizacao;
create policy trator_localizacao_ler on public.trator_localizacao
  for select to authenticated using (true);

-- grava só vendedor ativo, em nome dele mesmo
drop policy if exists trator_localizacao_vendedor on public.trator_localizacao;
create policy trator_localizacao_vendedor on public.trator_localizacao
  for insert to authenticated
  with check (exists (
    select 1 from public.vendedores v
     where v.auth_uid = auth.uid() and v.ativo is not false and v.id = vendedor_id
  ));

notify pgrst, 'reload schema';
