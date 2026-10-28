-- Feedbacks: o que estava PARADO volta para a fila (José, 23/10/2026: "Voltar para a fila").
-- Rodar no SQL Editor do projeto do PORTAL (citrhumdk…). Idempotente.
--
-- 1) Ligações do cockpit abertas há mais de 2 horas (4 em 23/10: 10/09, 11/09, 09/10 ×2) são
--    encerradas como "sem resposta", com nota explicando. Não mexe em ligação de hoje.
-- 2) Atendimentos CRM/RFM "em andamento" sem movimento há mais de 30 dias voltam a "aberto" e
--    sem atendente, para a fila nova distribuir. As tentativas e o histórico ficam.

begin;

update feedback_chamada
   set encerrada_em = now(),
       desfecho = 'sem_resposta',
       notas_encerramento = coalesce(nullif(notas_encerramento, '') || E'\n', '')
         || 'Encerrada automaticamente em 23/10/2026: ligação ficou aberta sem ninguém encerrar.',
       atualizado_em = now()
 where encerrada_em is null
   and iniciada_em < now() - interval '2 hours';

update feedback_registros
   set status_atendimento = 'aberto',
       atendente_id = null,
       atendente_nome = null,
       atualizado_em = now()
 where status_atendimento = 'em_andamento'
   and coalesce(atualizado_em, criado_em) < now() - interval '30 days';

commit;

-- Conferência (deve dar 0 e 0):
select
  (select count(*) from feedback_chamada where encerrada_em is null and iniciada_em < now() - interval '2 hours') as ligacoes_presas,
  (select count(*) from feedback_registros where status_atendimento = 'em_andamento' and coalesce(atualizado_em, criado_em) < now() - interval '30 days') as em_andamento_parados;
