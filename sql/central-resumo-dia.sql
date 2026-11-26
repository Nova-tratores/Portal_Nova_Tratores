-- =============================================================================
-- CENTRAL DE TRABALHO — resumo de fim de dia (melhorias-central-de-trabalho.md, 6.1)
-- Seg a sex às 17:30 (horário de Brasília), cada pessoa recebe no sino:
--   "Hoje você fechou 3 e passou 1 bola; chegaram 2 pedidos novos." · "Amanhã começa por #308 …"
-- Só vai para quem teve movimento no dia. Feriado: a tarefa pula.
-- Tarefa 'central-resumo-dia' em src/lib/agendador/tarefas.ts. O horário se muda na tela do
-- agendador (é a coluna hora). Desligar sem SQL: CENTRAL_RESUMO_DIA=off no servidor.
-- Rodar no SQL Editor do Supabase. Idempotente.
-- Desfazer: delete from agendamentos where chave = 'central-resumo-dia';
-- =============================================================================
do $$
begin
  if to_regclass('public.agendamentos') is not null then
    insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, dias_semana, prioridade, usa_omie, duracao_max_min, ativo)
    values ('central-resumo-dia', 'central-resumo-dia', 'Resumo de fim de dia', 'Central de Trabalho',
      'Avisa cada pessoa no sino o que fechou, a bola que passou e o que chegou hoje, e por qual pedido começa amanhã.',
      'diario', '17:30', '{1,2,3,4,5}', 'rapido', false, 10, true)
    on conflict (chave) do nothing;
  end if;
end $$;
