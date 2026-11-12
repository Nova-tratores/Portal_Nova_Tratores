-- Conserto da tela da Omie (11/11/2026): locações alteradas pela API que a tela não mostra
-- e locações incluídas pelo portal sem "Onde será exibida". Roda às 06:00 (antes do
-- expediente, depois da cadeia noturna), retoma no dia seguinte se não terminar e se
-- DESLIGA sozinha quando acaba. Para o "Tipo:" depois: parametros {"tipo": true} e ativo=true.
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, intervalo_min, janela_inicio, janela_fim, dias_semana, parametros, prioridade, usa_omie, grupo, duracao_max_min, ativo) values
  ('caract-tela-omie', 'caract-tela-omie', 'Conserto da tela da Omie (características)', 'Ajustes',
   'Regrava (excluir + incluir) as características alteradas pela API que a tela da Omie não mostra e as locações sem "Onde será exibida". Desliga sozinha quando termina.',
   'diario', '06:00', null, null, null, null, '{"limite_min": 100}', 'pesado', true, null, 110, true)
on conflict (chave) do nothing;
