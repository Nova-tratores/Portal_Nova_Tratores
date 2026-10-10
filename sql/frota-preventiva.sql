-- =============================================================================
-- FROTA · manutenção PREVENTIVA (Fase 2, fatia 2 — 10/10/2026)
--
-- Decisões do José: o portal substitui a Rota Exata como fonte da preventiva e
-- os intervalos vêm do MANUAL de cada veículo. Por isso o plano é cadastrado
-- por MODELO DE MANUTENÇÃO (ex.: "Fiat Strada Working 1.4 2024"), com a
-- referência do manual, e vale para os carros ligados àquele modelo.
--
--  frota_modelos_manutencao  o modelo (nome + manual: link do PDF e referência)
--  frota_planos              itens do plano: intervalo km / horas / meses,
--                            aviso antes de vencer, modo deslizante ou fixo
--  frota_veiculos.modelo_manutencao_id   a que modelo o carro pertence
--  frota_servicos            o que FOI FEITO (data + km). Só ele reinicia a
--                            contagem. O vencimento é calculado na leitura
--                            (src/lib/frota/preventiva.ts), nunca gravado.
--
-- RLS igual ao resto da frota: leitura com o módulo, escrita só pelas rotas.
-- Sem esta migration a aba Preventivas avisa que falta aplicar e nada quebra.
-- Idempotente. Correr no Supabase: SQL Editor -> colar -> Run.
-- =============================================================================

begin;

create table if not exists frota_modelos_manutencao (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null unique,
  manual_url         text,               -- PDF do manual (storage) ou link do fabricante
  manual_referencia  text,               -- ex.: "Manual do proprietário, pág. 142 — Plano de manutenção"
  obs                text,
  criado_por         text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

create table if not exists frota_planos (
  id               uuid primary key default gen_random_uuid(),
  modelo_id        uuid not null references frota_modelos_manutencao(id) on delete cascade,
  nome             text not null,          -- "Troca de óleo e filtro"
  componente_id    uuid references frota_componentes(id),
  intervalo_km     integer check (intervalo_km is null or intervalo_km > 0),
  intervalo_horas  integer check (intervalo_horas is null or intervalo_horas > 0),
  intervalo_meses  integer check (intervalo_meses is null or intervalo_meses > 0),
  aviso_km         integer not null default 1000,
  aviso_horas      integer not null default 25,
  aviso_dias       integer not null default 30,
  modo             text not null default 'deslizante' check (modo in ('deslizante','fixo')),
  referencia       text,                   -- página/tabela do manual deste item
  ordem            integer not null default 0,
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  check (intervalo_km is not null or intervalo_horas is not null or intervalo_meses is not null)
);
create index if not exists idx_frota_planos_modelo on frota_planos (modelo_id);

alter table frota_veiculos add column if not exists modelo_manutencao_id uuid references frota_modelos_manutencao(id) on delete set null;

create table if not exists frota_servicos (
  id           uuid primary key default gen_random_uuid(),
  veiculo_id   uuid not null references frota_veiculos(id) on delete cascade,
  placa        text not null,
  plano_id     uuid references frota_planos(id) on delete set null,
  data         date not null,
  km           numeric(12,1),
  horas_motor  numeric(10,1),
  origem       text not null default 'manual' check (origem in ('manual','os','requisicao','rotaexata')),
  origem_ref   text,
  obs          text,
  criado_por   text,
  criado_em    timestamptz not null default now()
);
create index if not exists idx_frota_servicos_veic on frota_servicos (veiculo_id, plano_id, data desc);
create unique index if not exists uq_frota_servicos_origem
  on frota_servicos (origem, origem_ref, plano_id) where origem_ref is not null;

do $$
declare t text;
begin
  foreach t in array array['frota_modelos_manutencao','frota_planos','frota_servicos']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %I on %I;', t || '_select', t);
    execute format('create policy %I on %I for select to authenticated using (public.portal_pode_frota());', t || '_select', t);
    execute format('revoke all on %I from anon;', t);
    execute format('revoke insert, update, delete on %I from authenticated;', t);
    execute format('grant select on %I to authenticated;', t);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
