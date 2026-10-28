-- Planta Viva — Balcão de peças: PV e remessas abertos na Omie, com quem criou.
-- Cadastra a tarefa `planta-omie-abertos` no agendador (worker), a cada 2 horas, das 06:00
-- às 20:00. Ela faz a mesma leitura das telas /ajustes/pedidos e /ajustes/remessas e grava
-- os números (e a lista do detalhe) em planta_kpi. Uma rodada leva ~7 min (as remessas paginam
-- todas as OS da Omie; medido em 27/10/2026). Não cria tabela; idempotente.
-- Sem este SQL os dois quadros da Omie ficam "sem leitura" na /planta; o resto segue igual.

do $$
begin
  if to_regclass('public.agendamentos') is null then
    raise warning 'agendador não instalado (sql/agendador.sql) — nada feito';
    return;
  end if;
  insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, intervalo_min, dias_semana, janela_inicio, janela_fim, hora, prioridade, usa_omie, duracao_max_min, ativo)
  values ('planta-omie-abertos', 'planta-omie-abertos', 'Planta Viva — PV e remessas abertos (Omie)', 'Sistema',
          'Lê na Omie os pedidos de venda e as remessas em aberto das duas contas, com quem criou (mesma leitura de /ajustes/pedidos e /ajustes/remessas), para o Balcão de peças da /planta.',
          'intervalo', 120, null, '06:00', '20:00', null, 'pesado', true, 15, true)
  on conflict (chave) do nothing;
end $$;

-- O quadro antigo "PPV em aberto" virou dois (pedido e remessa): tira a linha velha.
delete from planta_kpi where kpi_id = 'ppv_aberto';

-- Conferência (1 linha; depois da 1ª rodada, 6 linhas de planta_kpi):
--   select chave, ativo, intervalo_min, janela_inicio, janela_fim from agendamentos where chave = 'planta-omie-abertos';
--   select kpi_id, conta, contagem, calculado_em, erro from planta_kpi where kpi_id in ('pv_omie_aberto', 'rem_omie_aberta');
