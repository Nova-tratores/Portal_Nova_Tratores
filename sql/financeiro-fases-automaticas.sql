-- Robô "Fases do Financeiro" no agendador do portal (29/10/2026).
-- Todo dia às 07:00 confere os cards em Gerar boleto / Aguardando cliente / Vencido com o
-- contas a receber do Omie: recebido → Pago; atrasado ou vencido sem pagamento → Vencido.
-- Também roda quando alguém abre um kanban do Financeiro. Projeto: portal (citrhumdk…).
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, prioridade, usa_omie, duracao_max_min, ativo)
values ('financeiro-fases', 'financeiro-fases', 'Fases do Financeiro (confere o Omie)', 'Financeiro',
        'Às 07:00: card recebido no Omie vai para Pago; vencido sem pagamento vai para Vencido. Cada movimento fica no histórico do card. Lê o contas a receber já sincronizado (não chama o Omie).',
        'diario', '07:00', 'rapido', false, 10, true)
on conflict (chave) do update
  set hora = excluded.hora, descricao = excluded.descricao, nome = excluded.nome, ativo = true;

notify pgrst, 'reload schema';
