-- Financeiro: vigia de card parado + conferência card × Omie (29/10/2026). Projeto: portal (citrhumdk…).
-- Só cadastra os dois agendamentos (o código está em lib/agendador/tarefas.ts). Idempotente.
--  * financeiro-vigia       08:00 seg–sex: UM resumo por setor no sino (Financeiro / Pós-Vendas / Peças).
--  * financeiro-conferencia 05:45 todo dia: título a receber sem card, card com valor/vencimento ≠ Omie.
-- Os dois só leem e avisam; não mexem em card nenhum. Ficam melhores com
-- sql/financeiro-status-changed-at.sql (sem ele o vigia usa a data do último movimento no histórico).
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, dias_semana, prioridade, usa_omie, duracao_max_min, ativo)
values
  ('financeiro-vigia', 'financeiro-vigia', 'Vigia de card parado (Financeiro)', 'Financeiro',
   'Às 08:00 dos dias úteis: Gerar boleto parado há mais de 1 dia útil (e vencido sem boleto, em destaque) vai para o Financeiro, junto com o que o robô de fases moveu nas últimas 24 h e o total a receber na semana; Enviar ao cliente (+2), Sem boleto (+7) e Vencido sem recobrança (+3) vão para o Pós-Vendas ou Peças, pelo setor do card. Só avisa no sino.',
   'diario', '08:00', '{1,2,3,4,5}', 'rapido', false, 5, true),
  ('financeiro-conferencia', 'financeiro-conferencia', 'Conferência card × Omie (Financeiro)', 'Financeiro',
   'Às 05:45: compara os títulos do contas a receber dos últimos 60 dias (NF-e/NFS-e) com os cards do Financeiro — título a receber sem card, NF em card de outro cliente/valor, card com valor (± R$ 1) ou vencimento diferente. Só avisa no sino do Financeiro; não mexe em nada.',
   'diario', '05:45', null, 'rapido', false, 5, true)
on conflict (chave) do update
  set hora = excluded.hora, dias_semana = excluded.dias_semana, descricao = excluded.descricao, nome = excluded.nome;

notify pgrst, 'reload schema';
