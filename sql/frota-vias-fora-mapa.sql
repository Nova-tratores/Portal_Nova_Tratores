-- =============================================================================
-- FROTA · VIAS FORA DO MAPA (22/10/2026)
--
-- Trechos que os carros andaram longe de qualquer via do OpenStreetMap
-- (estrada de fazenda, carreador, atalho de terra), calculados do histórico de
-- GPS (rotas_vendedor). Camada "Vias fora do mapa" em /frota/mapa e /mapa-geral.
--
--  - frota_vias_trechos: um trecho por linha (pontos [[lat,lng,vel],…] + km,
--    velocidade, distância da via, caixa para filtrar por região);
--  - frota_vias_dias: o que já foi processado (placa × dia). `pendente` = a
--    malha de algum quadrante ainda não baixou; tenta de novo na próxima rodada;
--  - agendamento diário 05:15 (depois do fechar-dia das 04:20).
-- A malha do OSM fica no bucket privado `frota-vias-osm` (criado aqui e, se
-- faltar, pelo próprio portal).
--
-- Leitura e escrita SÓ pelas rotas /api (service role). RLS ligado sem policy.
-- Sem esta migration: a camada avisa "migração pendente" e o agendamento não existe.
-- Idempotente. Correr no Supabase: SQL Editor -> colar -> Run.
-- =============================================================================

create table if not exists frota_vias_trechos (
  id              bigserial primary key,
  placa           text not null,
  data            date not null,
  inicio          timestamptz not null,
  fim             timestamptz not null,
  pontos          jsonb not null,
  km              numeric(9,3) not null,
  vel_mediana     numeric(5,1),
  dist_max_m      integer,
  dist_mediana_m  integer,
  lat_min         double precision not null,
  lat_max         double precision not null,
  lng_min         double precision not null,
  lng_max         double precision not null,
  criado_em       timestamptz not null default now()
);
comment on table frota_vias_trechos is 'Trechos andados fora das vias do OpenStreetMap (lib/frota/vias-fora-mapa). Regravados por placa+dia.';
create index if not exists idx_frota_vias_trechos_data on frota_vias_trechos (data);
create index if not exists idx_frota_vias_trechos_placa_data on frota_vias_trechos (placa, data);

create table if not exists frota_vias_dias (
  placa           text not null,
  data            date not null,
  assinatura      text,
  situacao        text not null check (situacao in ('ok', 'pendente')),
  trechos         integer,
  km_fora         numeric(9,3),
  pontos_andando  integer,
  pontos_fora     integer,
  tiles_faltando  text[],
  processado_em   timestamptz not null default now(),
  primary key (placa, data)
);
comment on table frota_vias_dias is 'Estado do cálculo das vias fora do mapa por placa e dia (assinatura = hora_fim|km_total da rota).';
create index if not exists idx_frota_vias_dias_data on frota_vias_dias (data);

alter table frota_vias_trechos enable row level security;
alter table frota_vias_dias enable row level security;
revoke all on frota_vias_trechos from anon, authenticated;
revoke all on frota_vias_dias from anon, authenticated;
revoke all on sequence frota_vias_trechos_id_seq from anon, authenticated;

-- bucket privado da malha do OSM (um .json.gz por quadrante de 0,1°)
insert into storage.buckets (id, name, public)
values ('frota-vias-osm', 'frota-vias-osm', false)
on conflict (id) do nothing;

-- agendamento diário (só se o agendador existe neste banco)
do $$
begin
  if to_regclass('public.agendamentos') is not null then
    insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, prioridade, usa_omie, duracao_max_min, ativo)
    values ('frota-vias-fora-mapa', 'frota-vias-fora-mapa', 'Vias fora do mapa', 'Frota',
      'Procura no GPS dos últimos 14 dias os trechos andados fora das vias do OpenStreetMap (camada do /frota/mapa).',
      'diario', '05:15', 'pesado', false, 60, true)
    on conflict (chave) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
