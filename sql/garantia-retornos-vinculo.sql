-- Devolução em garantia ↔ garantia (26/11/2026).
-- A devolução emitida pelo Recebimentos não ficava ligada a nenhuma garantia: a pendência
-- "Devolução de peças" da garantia não fechava. Agora cada devolução pode ficar ligada a
-- UMA OU MAIS garantias (uma nota da fábrica pode trazer peças de várias SGs) ou ser marcada
-- "sem garantia no portal" com motivo. Enquanto nenhum dos dois acontece, a devolução
-- faturada aparece no aviso da tela Garantias e no lembrete semanal do sino.
-- Rodar no SQL Editor. Idempotente.

alter table garantia_retornos add column if not exists garantia_ids uuid[] not null default '{}';
alter table garantia_retornos add column if not exists sem_garantia_motivo text;
alter table garantia_retornos add column if not exists sem_garantia_por text;
alter table garantia_retornos add column if not exists sem_garantia_em timestamptz;
alter table garantia_retornos add column if not exists vinculo_alertado_em date;

-- devoluções já ligadas pela seção Devolução da garantia
update garantia_retornos set garantia_ids = array[garantia_id]
 where garantia_id is not null and (garantia_ids is null or cardinality(garantia_ids) = 0);

create index if not exists garantia_retornos_sem_vinculo_idx on garantia_retornos (criado_em)
 where status = 'faturada' and sem_garantia_em is null and cardinality(garantia_ids) = 0;

notify pgrst, 'reload schema';
