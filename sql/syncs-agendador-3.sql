-- Sync completo de recebimentos e sync completo da Pasta Clientes no agendador do
-- portal (04/11/2026). Antes: GitHub Actions chamando o serviço WEB (recebimentos "a cada
-- 15 min" no papel, 3–4x/dia de fato; Pasta Clientes 05:30 no papel, ~13h de fato) e
-- morrendo no deploy do site. Agora rodam no worker, à noite, no grupo omie-pesado,
-- depois do CMC (21:30). Tarefas em src/lib/agendador/tarefas.ts; os workflows viraram
-- reserva. Idempotente. O agendador relê a tabela a cada volta (não precisa reiniciar).
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, parametros, prioridade, usa_omie, grupo, duracao_max_min, ativo) values
  ('estoque-sync-recebimentos', 'estoque-sync-recebimentos', 'Recebimentos de NF-e (completo)', 'Estoque',
   'Relê TODOS os recebimentos de NF-e da Omie nas duas contas (recebimentos_nfe) e abre as demandas de alocação. De dia, o recente de 45 dias roda a cada 10 min.',
   'diario', '22:00', '{}', 'pesado', true, 'omie-pesado', 45, true),
  ('clientes-sync-omie', 'clientes-sync-omie', 'Pasta Clientes (sync completo)', 'Clientes',
   'Clientes, projetos/máquinas com o último cliente, OS e PV do ano e NFs nas duas contas — o mesmo que o botão "Sincronizar" da Pasta Clientes.',
   'diario', '22:30', '{}', 'pesado', true, 'omie-pesado', 60, true)
on conflict (chave) do nothing;
