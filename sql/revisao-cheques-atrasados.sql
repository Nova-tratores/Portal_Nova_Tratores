-- Cheques de revisão ATRASADOS: uma OS de revisão pode gerar também os cheques
-- das revisões anteriores que nunca foram enviados (ex.: 50h e 300h geradas a
-- partir da OS da 600h). Antes era 1 cheque por OS (os_id UNIQUE).
--   atrasado = true  → cheque extra, gerado pela OS atual pra uma revisão anterior
--   os_ref           → OS daquela revisão anterior, quando existe (fonte dos dados)
-- Continua havendo UM cheque principal por OS (índice parcial) e um por horas.
alter table public.revisao_cheques drop constraint if exists revisao_cheques_os_id_key;
alter table public.revisao_cheques add column if not exists atrasado boolean not null default false;
alter table public.revisao_cheques add column if not exists os_ref text;
create unique index if not exists revisao_cheques_principal_uq on public.revisao_cheques (os_id) where not atrasado;
create unique index if not exists revisao_cheques_os_horas_uq on public.revisao_cheques (os_id, horas);
notify pgrst, 'reload schema';
