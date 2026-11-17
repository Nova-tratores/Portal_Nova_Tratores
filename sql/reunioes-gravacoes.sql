-- REUNIÕES — gravação da transmissão ao vivo (17/11/2026). Projeto do PORTAL (citrhumdkfivdzbmayde).
-- Rodar depois do deploy. Sem este SQL: o bucket é criado sozinho na 1ª gravação, mas nada apaga
-- as gravações com mais de 60 dias.

-- bucket privado (o portal também cria sozinho se não existir); até 100 MB por parte, só vídeo webm
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reunioes-gravacoes', 'reunioes-gravacoes', false, 104857600, array['video/webm'])
on conflict (id) do nothing;

-- robô diário: apaga as partes com mais de 60 dias (tarefa reunioes-gravacoes-limpar em lib/agendador/tarefas.ts)
do $$
begin
  if to_regclass('public.agendamentos') is not null then
    insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, prioridade, usa_omie, duracao_max_min, ativo)
    values ('reunioes-gravacoes-limpar', 'reunioes-gravacoes-limpar', 'Apagar gravações antigas das reuniões', 'Central de Trabalho',
      'Apaga do bucket reunioes-gravacoes as partes gravadas há mais de 60 dias e tira da lista da reunião.',
      'diario', '04:40', 'rapido', false, 10, true)
    on conflict (chave) do nothing;
  end if;
end $$;
