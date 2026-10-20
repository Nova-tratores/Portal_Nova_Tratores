-- LOUSA: lançamentos fora de OS (José, 20/10/2026)
-- Clicando no DIA: Reunião / Folga para todos ou para os técnicos escolhidos.
-- Clicando no TÉCNICO: Férias (n dias), Falta (meio período, 1 dia ou de–até horas;
-- justificada ou não + motivo) e Médico (dia todo ou período + atestado).
-- Falta e Médico espelham no RH como "pendente de validação" (rh_ponto_eventos);
-- Férias viram pedido para o RH aprovar (rh_ferias_pedidos, no banco do RH).
-- Uma linha por dia × técnico; o "grupo" junta o que foi lançado de uma vez.
-- Idempotente. Sem esta migration a Lousa continua igual; só os lançamentos novos avisam.

alter table lousa_servicos add column if not exists titulo text;
alter table lousa_servicos add column if not exists hora_inicio text;
alter table lousa_servicos add column if not exists hora_fim text;
alter table lousa_servicos add column if not exists motivo text;
alter table lousa_servicos add column if not exists justificada boolean;
alter table lousa_servicos add column if not exists anexo_path text;
alter table lousa_servicos add column if not exists grupo_id uuid;
alter table lousa_servicos add column if not exists rh_ref text;      -- id do evento/pedido no RH
alter table lousa_servicos add column if not exists rh_status text;   -- enviado | erro | sem_rh
alter table lousa_servicos add column if not exists rh_erro text;

create index if not exists lousa_servicos_grupo_idx on lousa_servicos (grupo_id) where grupo_id is not null;

notify pgrst, 'reload schema';
