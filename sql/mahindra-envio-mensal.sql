-- Rodar no projeto citrhumdkfivdzbmayde (PORTAL). Só dados, sem schema novo.
-- Arquivo Mahindra (estoque e venda de peças) do mês anterior por e-mail, todo dia 2 às 07:00
-- (José, 04/11/2026). Tarefa 'mahindra-mensal' em src/lib/agendador/tarefas.ts; envio em
-- src/lib/ajustes/mahindra-mensal.ts. Destinatários editáveis em Dev → Envios de e-mail.

insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, dia_mes, prioridade, usa_omie, grupo, duracao_max_min, ativo)
values ('mahindra-mensal', 'mahindra-mensal', 'Mahindra — arquivo mensal por e-mail', 'Ajustes',
        'Dia 2, 07:00: gera (ou reaproveita) o arquivo padrão Mahindra do mês anterior e manda para os destinatários de Dev → Envios de e-mail (mahindra_mensal). Interrompido por deploy, roda de novo no mesmo dia sem duplicar.',
        'mensal', '07:00', 2, 'pesado', true, 'omie-pesado', 40, true)
on conflict (chave) do update set hora = excluded.hora, dia_mes = excluded.dia_mes, descricao = excluded.descricao, ativo = true;

insert into email_envios_config (chave, ativo, destinatarios, cc, bcc, parametros, atualizado_em, atualizado_por)
values ('mahindra_mensal', true, array['zezo.piraju@gmail.com'], array[]::text[], array[]::text[], '{"contas":"NOVA"}'::jsonb, now(), 'Claude (pedido do José, 04/11/2026)')
on conflict (chave) do nothing;
