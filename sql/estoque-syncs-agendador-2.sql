-- Livro-razão de movimentos e backfill de CMC no agendador do portal (28/10/2026).
-- Antes: GitHub Actions (02:20 e 02:45 no papel; rodavam 07h–08h e morriam no deploy
-- do site, porque o GitHub chama o serviço web). Agora rodam no worker, à noite, no
-- grupo omie-pesado (um de cada vez, depois das características 20:00 e dos produtos
-- 20:30). Tarefas em src/lib/agendador/tarefas.ts; os workflows viraram reserva.
-- Idempotente. O agendador relê a tabela a cada volta (não precisa reiniciar).
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, parametros, prioridade, usa_omie, grupo, duracao_max_min, ativo) values
  ('estoque-sync-movimentos', 'estoque-sync-movimentos', 'Livro-razão de movimentos', 'Estoque',
   'Relê na Omie a janela recente (60 dias) das peças que se moveram no mês, nas duas contas. Fonte da Reconciliação e do estoque do gráfico mensal.',
   'diario', '21:00', '{"dias": 60, "max_min": 13}', 'pesado', true, 'omie-pesado', 30, true),
  ('estoque-backfill-cmc', 'estoque-backfill-cmc', 'Custo (CMC) das vendas', 'Estoque',
   'Preenche o custo das vendas que ainda estão sem CMC, em lotes, nas duas contas (~45 min).',
   'diario', '21:30', '{}', 'pesado', true, 'omie-pesado', 120, true)
on conflict (chave) do nothing;
