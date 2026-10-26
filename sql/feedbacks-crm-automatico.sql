-- =============================================================================
-- CRM AUTOMÁTICO DAS OS FATURADAS (José, 23/10/2026)
-- Toda OS faturada vira uma ligação de satisfação no /feedbacks/crm, já preenchida
-- (cliente, telefone, trator, técnico, serviço), entre 3 e 15 dias depois do
-- faturamento. Uma ligação por OS (os_ref) e no máximo uma por cliente a cada 30 dias.
-- Robô: agendamento 'feedbacks-crm-automatico' todo dia às 06:20 (Brasília).
-- Desliga com FEEDBACKS_CRM_AUTO=off no Railway, ou pausando aqui no /agendamentos.
-- Idempotente. Correr no Supabase do PORTAL (projeto citrhumdkfivdzbmayde):
-- SQL Editor -> colar -> Run.
-- =============================================================================

alter table feedback_registros add column if not exists os_ref text;        -- 'NOVA:5395' | 'CASTRO:123'
alter table feedback_registros add column if not exists os_valor numeric;   -- valor_total da OS no Omie
alter table feedback_registros add column if not exists faturado_em date;   -- data_faturamento da OS
alter table feedback_registros add column if not exists origem_auto text;   -- 'os_faturada' = criado pelo robô

-- uma ligação por OS (por tipo); registros manuais (os_ref nulo) não entram
create unique index if not exists feedback_registros_tipo_os_ref_uniq
  on feedback_registros (tipo, os_ref) where os_ref is not null;

insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, prioridade, usa_omie, duracao_max_min, ativo)
values ('feedbacks-crm-automatico', 'feedbacks-crm-automatico', 'CRM automático (OS faturadas)', 'Comercial',
        'Às 06:20: cada OS faturada há 3 a 15 dias vira uma ligação de satisfação no CRM (Feedbacks), já preenchida. Uma por OS; no máximo uma por cliente a cada 30 dias; pula cliente "Não contatar".',
        'diario', '06:20', 'rapido', false, 10, true)
on conflict (chave) do update
  set hora = excluded.hora, descricao = excluded.descricao, nome = excluded.nome, ativo = true;

notify pgrst, 'reload schema';
