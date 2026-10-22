-- =============================================================================
-- FROTA · setor do carro + situação "sem uso" (José, 22/10/2026)
--
-- setor: Comercial · Peças · Pós-Vendas · Pessoal. A coluna `setor` já existia
--   (vazia); a `categoria` continua como está (Custos usa). Preenche o setor a
--   partir da categoria: comercial → comercial, oficina → pos_vendas. Os "outros"
--   ficam sem setor até alguém escolher na ficha.
-- sem_uso: o carro ainda é da loja, mas está parado — não cobra checklist nem
--   km e não entra nos alertas de parado. Marcar/desmarcar exige a permissão
--   "Vender, arquivar ou marcar sem uso" (só Dev concede).
--
-- Junto: o vínculo de técnico do Danilo passa para o TKY6E68 (o carro dele na
-- Frota desde 22/09; o checklist seguia cobrando o FXM4G90).
-- Idempotente. Correr no Supabase do PORTAL: SQL Editor -> colar -> Run.
-- =============================================================================

begin;

alter table frota_veiculos add column if not exists sem_uso boolean not null default false;
alter table frota_veiculos add column if not exists sem_uso_motivo text;
alter table frota_veiculos add column if not exists sem_uso_em timestamptz;
alter table frota_veiculos add column if not exists sem_uso_por text;

update frota_veiculos
   set setor = case categoria when 'comercial' then 'comercial' when 'oficina' then 'pos_vendas' end
 where setor is null and categoria in ('comercial', 'oficina');

update frota_veiculos set setor = null
 where setor is not null and setor not in ('comercial', 'pecas', 'pos_vendas', 'pessoal');

alter table frota_veiculos drop constraint if exists frota_veiculos_setor_check;
alter table frota_veiculos add constraint frota_veiculos_setor_check
  check (setor is null or setor in ('comercial', 'pecas', 'pos_vendas', 'pessoal'));

update tecnico_veiculos
   set placa = 'TKY6E68', descricao = 'SAVEIRO ROBUST', adesao_id = 83027
 where id = 8 and tecnico_nome = 'Danilo de Souza';

commit;

notify pgrst, 'reload schema';
