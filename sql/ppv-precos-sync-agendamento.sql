-- Sync incremental dos preços do PPV/Orçamento (Produtos_Completos) no agendador do portal.
-- Tarefa 'ppv-precos-sync' em src/lib/agendador/tarefas.ts: pede à Omie só os produtos
-- alterados nos últimos 3 dias, a cada 10 min, seg–sáb 07:00–20:00 (Brasília).
-- Idempotente. O agendador relê a tabela a cada volta (não precisa reiniciar).
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, intervalo_min, dias_semana, janela_inicio, janela_fim, hora, prioridade, usa_omie, duracao_max_min, ativo) values
  ('ppv-precos-sync', 'ppv-precos-sync', 'Preços do PPV/Orçamento', 'Peças',
   'Atualiza o preço de venda das peças alteradas na Omie nos últimos 3 dias (tabela que o PPV e o Orçamento usam).',
   'intervalo', 10, '{1,2,3,4,5,6}', '07:00', '20:00', null, 'rapido', true, 8, true)
on conflict (chave) do nothing;
