-- =============================================================================
-- Robô dos números do Instagram (25/11/2026). Projeto do PORTAL: citrhumdkfivdzbmayde.
-- Precisa de sql/site-redes.sql antes (tabelas site_redes_contas e site_redes_metricas).
-- Todo dia às 06:30 grava os 3 últimos dias do Instagram ligado (src/lib/marketing/redes/meta.ts).
-- Sem conta ligada, o robô só pula. Pode rodar de novo sem problema.
-- =============================================================================
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, prioridade, usa_omie, duracao_max_min, ativo) values
  ('marketing-redes-numeros', 'marketing-redes-numeros', 'Marketing — números do Instagram', 'Marketing',
   'Busca na Meta alcance, visualizações, interações, toques no link e seguidores do Instagram ligado (3 últimos dias) e grava para a aba Acessos.',
   'diario', '06:30', 'rapido', false, 5, true)
on conflict (chave) do nothing;

-- Conferir: deve mostrar 1 linha.
select chave, hora, ativo from agendamentos where chave = 'marketing-redes-numeros';

-- Desfazer:
--   delete from agendamentos where chave = 'marketing-redes-numeros';
