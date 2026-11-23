-- Troca diária dos links de arquivo com o endereço antigo do Supabase para
-- midia.novatratores.com (23/11/2026). Usa a função midia_links_trocar() de
-- sql/midia-links-dominio.sql (já criada em 11/11). Tarefa 'midia-links-trocar'
-- em src/lib/agendador/tarefas.ts; MIDIA_LINKS_TROCAR=off desliga.
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, intervalo_min, janela_inicio, janela_fim, dias_semana, parametros, prioridade, usa_omie, grupo, duracao_max_min, ativo) values
  ('midia-links-trocar', 'midia-links-trocar', 'Links de arquivo no domínio da Nova', 'Sistema',
   'Troca os links de arquivo gravados com o endereço do Supabase (citrhumdkfivdzbmayde.supabase.co) por midia.novatratores.com. O arquivo é o mesmo; muda só o endereço.',
   'diario', '04:30', null, null, null, null, '{}', 'rapido', false, null, 15, true)
on conflict (chave) do nothing;

-- Rollback: delete from agendamentos where chave = 'midia-links-trocar';
