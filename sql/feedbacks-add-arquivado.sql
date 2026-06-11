-- Migration: status_atendimento 'arquivado' + justificativa.
-- Permite arquivar um atendimento (cliente que não vale a pena) com motivo.
-- Rodar no SQL Editor do projeto do Portal (citrhumdkfivdzbmayde).

ALTER TABLE feedback_registros
  DROP CONSTRAINT IF EXISTS feedback_registros_status_atendimento_check;
ALTER TABLE feedback_registros
  ADD CONSTRAINT feedback_registros_status_atendimento_check
  CHECK (status_atendimento IN ('aberto','em_andamento','concluido','sem_resposta','arquivado'));

ALTER TABLE feedback_registros
  ADD COLUMN IF NOT EXISTS arquivado_motivo text;
