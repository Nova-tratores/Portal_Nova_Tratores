-- Financeiro: cobrança por e-mail DEPOIS do vencimento (29/10/2026). Projeto: portal (citrhumdk…).
-- D+1 e D+7 para título ATRASADO no contas a receber, só para card cujo boleto foi enviado por
-- e-mail, na mesma conversa e pelo mesmo remetente. Idempotente.
--
-- ⚠️ ENVIA E-MAIL A CLIENTES. Por isso:
--   * o agendamento nasce DESLIGADO (ativo = false) e este script nunca o liga;
--   * mesmo ligado, a tarefa só envia com a variável FINANCEIRO_COBRANCA=on no Railway.
-- Para ligar: confira um dia de "Rodar agora" na tela /agendamentos com FINANCEIRO_COBRANCA=on e
-- depois marque o agendamento como ativo.

-- 1) o tipo 'cobranca' no histórico de e-mails do card (sem isto a tarefa não envia: grava o
--    registro ANTES de mandar e desiste se a gravação falhar)
alter table financeiro_emails drop constraint if exists financeiro_emails_tipo_check;
alter table financeiro_emails add constraint financeiro_emails_tipo_check
  check (tipo in ('boleto','lembrete','resposta','mensagem','cobranca'));

-- 2) agendamento (desligado)
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, dias_semana, prioridade, usa_omie, duracao_max_min, ativo)
values ('financeiro-cobranca', 'financeiro-cobranca', 'Cobrança por e-mail após o vencimento', 'Financeiro',
        'Às 10:00 dos dias úteis: e-mail educado de cobrança 1 e 7 dias depois do vencimento, só para título ATRASADO no Omie e card com boleto enviado por e-mail (mesma conversa). Não cobra Pix/cartão/cheque, card sem boleto nem vencido há mais de 180 dias. Só envia com FINANCEIRO_COBRANCA=on.',
        'diario', '10:00', '{1,2,3,4,5}', 'rapido', false, 10, false)
on conflict (chave) do update
  set hora = excluded.hora, dias_semana = excluded.dias_semana, descricao = excluded.descricao, nome = excluded.nome;
  -- (não mexe em "ativo": quem ligou continua ligado, quem não ligou continua desligado)

notify pgrst, 'reload schema';
