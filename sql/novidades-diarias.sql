-- =============================================================================
-- NOVIDADES DO DIA (José, 22/10/2026)
-- Todo dia às 07:00 (Brasília) o portal junta o que mudou ontem em cada módulo,
-- publica UMA novidade por módulo na base de conhecimento ("O que mudou": novo,
-- mudou, saiu, como fica agora) e avisa no sino quem tem acesso àquele módulo.
-- Os rascunhos antigos (antes de 22/10/2026) ficam como estão.
-- Desliga com NOVIDADES_DIARIAS=off no Railway, ou pausando aqui no /agendamentos.
-- Idempotente. Correr no Supabase do PORTAL: SQL Editor -> colar -> Run.
-- =============================================================================

insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, prioridade, usa_omie, duracao_max_min, ativo)
values ('novidades-diarias', 'novidades-diarias', 'Novidades do dia (O que mudou)', 'Sistema',
        'Às 07:00: o que mudou ontem em cada módulo vira aviso publicado na base de conhecimento e no sino de quem usa o módulo.',
        'diario', '07:00', 'rapido', false, 15, true)
on conflict (chave) do update
  set hora = excluded.hora, descricao = excluded.descricao, ativo = true;
