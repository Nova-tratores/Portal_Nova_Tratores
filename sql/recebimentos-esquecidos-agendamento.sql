-- Robô "Recebimentos esquecidos" (26/11/2026): 1x por dia, seg–sáb 07:30.
-- Nota pendente há 7+ dias → sino do responsável; 15+ dias → também o gestor direto
-- (Organograma). Mais de 90 dias fica fora do aviso (filtro "Paradas +90 dias" na tela).
-- Só cria a linha na tela /agendamentos; o código já está no portal. RECEB_ESQUECIDOS=off desliga.
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, intervalo_min, dias_semana, janela_inicio, janela_fim, hora, prioridade, usa_omie, duracao_max_min, ativo) values
  ('recebimentos-esquecidos', 'recebimentos-esquecidos', 'Recebimentos esquecidos', 'Estoque',
   'Notas e CT-e pendentes de entrada há 7+ dias: avisa o responsável no sino (um resumo por pessoa); com 15+ dias avisa também o gestor direto. Mais de 90 dias fica fora do aviso.',
   'diario', null, '{1,2,3,4,5,6}', null, null, '07:30', 'rapido', false, 5, true)
on conflict (chave) do nothing;

-- Rollback: delete from agendamentos where chave = 'recebimentos-esquecidos';
