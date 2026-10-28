-- Resserviço da OS (José, 22/10/2026) — projeto do PORTAL (citrhumdkfivdzbmayde).
-- Na OS original: `resservico` guarda o registro (OS nova, motivo, o que o técnico fez de errado, quem, quando).
-- Na OS de resserviço (cópia que vai para o app dos técnicos): `resservico_de` = Id_Ordem da original.
-- Idempotente; só acrescenta colunas que podem ficar vazias.
alter table "Ordem_Servico" add column if not exists resservico jsonb;
alter table "Ordem_Servico" add column if not exists resservico_de text;
create index if not exists ordem_servico_resservico_de_idx on "Ordem_Servico" (resservico_de) where resservico_de is not null;
notify pgrst, 'reload schema';
