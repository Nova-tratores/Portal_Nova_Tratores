-- LOUSA: OS pendente (José, 20/10/2026)
-- Arrastar o cartão da OS para baixo da faixa vermelha da Lousa marca a OS como PENDENTE.
-- A OS NÃO perde a data de execução; ela só ganha a marca e aparece:
--   - na Lousa, embaixo da faixa vermelha (fora do dia);
--   - no POS, na aba "Pendentes" (além da aba dela: Cliente/Garantias/Internas).
-- Arrastar de volta para um dia tira a marca e grava o dia/técnico novos.
-- Sem esta migration a Lousa e o POS funcionam; só o "pendente" fica desligado (a rota avisa).

alter table "Ordem_Servico" add column if not exists lousa_pendente boolean not null default false;
alter table "Ordem_Servico" add column if not exists lousa_pendente_em timestamptz;
alter table "Ordem_Servico" add column if not exists lousa_pendente_por text;

create index if not exists ordem_servico_lousa_pendente_idx on "Ordem_Servico" (lousa_pendente) where lousa_pendente;

notify pgrst, 'reload schema';
