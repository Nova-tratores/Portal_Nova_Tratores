-- Syncs da tabela `produtos` no agendador do portal (27/10/2026). Antes: GitHub Actions
-- (saldo "a cada 3 h", 13 min cada; completo "03:00", que rodava 06h20–07h50).
-- Tarefas em src/lib/agendador/tarefas.ts. Os workflows do GitHub viraram reserva.
-- Idempotente. O agendador relê a tabela a cada volta (não precisa reiniciar).
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, intervalo_min, dias_semana, janela_inicio, janela_fim, hora, prioridade, usa_omie, duracao_max_min, ativo) values
  ('estoque-saldos-rapido', 'estoque-saldos-rapido', 'Saldo e custo das peças', 'Estoque',
   'Lê na Omie só as peças com saldo (~6 s por conta) e grava em produtos só o que mudou (saldo, CMC, valor).',
   'intervalo', 10, '{1,2,3,4,5,6}', '07:00', '20:00', null, 'rapido', true, 8, true)
on conflict (chave) do nothing;

insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, prioridade, usa_omie, grupo, duracao_max_min, ativo) values
  ('estoque-sync-produtos', 'estoque-sync-produtos', 'Sync completo de produtos', 'Estoque',
   'Famílias + todos os produtos + estoque das duas contas e o retrato do mês. Conferência da noite (no dia o incremental e o saldo rápido cuidam).',
   'diario', '20:30', 'pesado', true, 'omie-pesado', 60, true)
on conflict (chave) do nothing;
