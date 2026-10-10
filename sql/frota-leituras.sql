-- =============================================================================
-- FROTA · leituras de km/horas feitas por gente (Fase 2, fatia 1 — 10/10/2026)
--
-- O km de cada carro passa a ser "âncora + delta" (src/lib/frota/km.ts): a
-- última leitura conferida no painel + o que o rastreador rodou depois. Esta
-- tabela guarda as leituras feitas no portal (foto do painel, entrada/saída da
-- oficina, ajuste do gestor). Checklist, abastecimento e requisição continuam
-- sendo lidos de onde já estão — não há cópia.
--
-- situacao: 'aceita' vira âncora; 'suspeita' (voltou ou saltou demais) espera
-- alguém do módulo conferir na aba Hoje; 'descartada' não conta.
-- client_uuid: o celular gera; reenviar da fila sem sinal não duplica.
--
-- RLS igual ao resto da frota: leitura com o módulo, escrita só pelas rotas.
-- Sem esta migration o portal funciona como antes (km do rastreador/digitado)
-- e o botão "Registrar km" avisa que falta aplicar.
-- Idempotente. Correr no Supabase: SQL Editor -> colar -> Run.
-- =============================================================================

begin;

create table if not exists frota_leituras (
  id             uuid primary key default gen_random_uuid(),
  client_uuid    uuid unique,
  veiculo_id     uuid references frota_veiculos(id) on delete cascade,
  placa          text not null,
  lida_em        timestamptz not null default now(),
  km             numeric(12,1),
  horas_motor    numeric(10,1),
  foto_url       text,
  fonte          text not null default 'painel_foto'
                 check (fonte in ('painel_foto','oficina_entrada','oficina_saida','ajuste_gestor')),
  ref            text,                 -- id da OS de frota, quando vier da oficina
  lido_por       text,
  lat            double precision,
  lng            double precision,
  situacao       text not null default 'aceita'
                 check (situacao in ('aceita','suspeita','descartada')),
  motivo         text,                 -- por que ficou suspeita
  conferido_por  text,
  conferido_em   timestamptz,
  criado_em      timestamptz not null default now(),
  check (km is not null or horas_motor is not null)
);

create index if not exists idx_frota_leituras_placa on frota_leituras (placa, lida_em desc);
create index if not exists idx_frota_leituras_suspeitas on frota_leituras (lida_em desc) where situacao = 'suspeita';

alter table frota_leituras enable row level security;
drop policy if exists frota_leituras_select on frota_leituras;
create policy frota_leituras_select on frota_leituras
  for select to authenticated using (public.portal_pode_frota());
revoke all on frota_leituras from anon;
revoke insert, update, delete on frota_leituras from authenticated;
grant select on frota_leituras to authenticated;

commit;

notify pgrst, 'reload schema';
