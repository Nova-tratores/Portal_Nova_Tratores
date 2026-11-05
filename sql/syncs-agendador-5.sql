-- 05/11/2026: robôs do DRE que só o app antigo (financeiro-omie-dashboard, Railway
-- financeiro-omie-production-ce7e) rodava — fora do portal, invisíveis em /agendamentos.
-- Passam para o agendador do worker. Nenhum dos dois chama a Omie (só leem o banco).
-- Monitor em minuto quebrado: às 13:00 em ponto vários robôs disparam juntos e o banco
-- cortava as consultas do monitor (statement timeout, 30/10 e 05/11).
-- O sync de contas das 06:00 do app antigo NÃO vem: o portal já faz (dre-financeiro-sync).
-- Depois de 1 dia rodando aqui, desligar o serviço financeiro-omie no Railway.
-- Idempotente.
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, prioridade, usa_omie, grupo, duracao_max_min, ativo) values
  ('dre-monitor-07h', 'dre-monitor', 'DRE: robôs do Monitor (manhã)', 'Financeiro',
   'Varre contas a pagar/receber, faturamento e compras atrás de lançamento com problema (qa_anomalias). Alimenta /dre-financeiro/monitor.',
   'diario', '07:10', 'rapido', false, null, 15, true),
  ('dre-monitor-13h', 'dre-monitor', 'DRE: robôs do Monitor (almoço)', 'Financeiro',
   'Varre contas a pagar/receber, faturamento e compras atrás de lançamento com problema (qa_anomalias). Alimenta /dre-financeiro/monitor.',
   'diario', '13:20', 'rapido', false, null, 15, true),
  ('dre-monitor-19h', 'dre-monitor', 'DRE: robôs do Monitor (fim do dia)', 'Financeiro',
   'Varre contas a pagar/receber, faturamento e compras atrás de lançamento com problema (qa_anomalias). Alimenta /dre-financeiro/monitor.',
   'diario', '19:10', 'rapido', false, null, 15, true),
  ('dre-patrimonio-snapshot', 'dre-patrimonio-snapshot', 'DRE: retrato diário do Patrimônio', 'Financeiro',
   'Grava o patrimônio do dia (estoque, frota, a receber, a pagar) por empresa e TODAS em cp_patrimonio_snapshot. Alimenta o histórico de /dre-financeiro/patrimonio.',
   'diario', '06:45', 'rapido', false, null, 10, true)
on conflict (chave) do nothing;
